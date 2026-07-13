"use client";

import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ContactDetailsElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateCustomerAddressAction } from "@/lib/cart-actions";
import { decideContactSubmit } from "@/lib/contact-email-submit";
import { useCheckoutActions } from "@/app/checkout/checkout-actions-context";
import { useToast } from "@/hooks/use-toast";
import { CheckoutFormStepEnum } from "@/components/checkout/utils";

const contactSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  newsletter: z.boolean(),
});

interface ContactFormStepProps {
  enableStripe: boolean;
  onNext: (data: { email: string; newsletter: boolean }) => void;
  buttonLabel?: string;
  defaultValues?: { email?: string; newsletter?: boolean };
  /** When provided, creates a new checkout session and updates cart on email submit instead of using Stripe updateEmail. */
  onRefreshSession?: (email: string, nextStep: string) => Promise<void>;
}

const ContactFormStep: React.FC<ContactFormStepProps> = ({
  enableStripe,
  onNext,
  defaultValues = { email: "", newsletter: false },
  buttonLabel = "Next",
  onRefreshSession,
}) => {
  const checkoutState = useCheckout();
  const { actions } = useCheckoutActions();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      ...defaultValues,
      email: defaultValues.email ?? "",
      newsletter: defaultValues.newsletter ?? false,
    },
  });

  // ENG-801: whether the contact step starts with a known email (server/cart
  // resolved prefill, or a restored email after a session recreate). When it
  // does, the Stripe ContactDetailsElement CANNOT show it: in Checkout
  // Sessions custom mode the element supports no options
  // (StripeCheckoutContactDetailsElementOptions = Record<string, never>; the
  // react wrapper additionally drops the options object at create), it never
  // initializes its display from the session email, and a freshly created
  // EMPTY element asserts empty onto the session — wiping any email pushed
  // via actions.updateEmail. So with a prefill we render the native email
  // input instead (prefilled AND editable); the Stripe element is kept for
  // the no-prefill first visit, where it drives Link (ENG-748).
  const hasPrefillEmail = !!(defaultValues.email ?? "").trim();

  // ENG-801 (quick-260714-7iq): explicit input mode instead of a render-time
  // ternary, so a returning shopper can opt back INTO Link. "native" renders
  // the RHF email input (prefilled AND editable); "element" mounts the blank
  // ContactDetailsElement whose typing drives Link (ENG-748). Toggling to the
  // element WIPES the session email (blank element asserts empty) — the
  // submit path (decideContactSubmit branch "update-email") repairs it.
  const [emailMode, setEmailMode] = useState<"native" | "element">(
    hasPrefillEmail ? "native" : "element",
  );
  // True once the shopper explicitly toggles — a late-arriving prefill must
  // never yank them out of an explicitly chosen mode.
  const userToggledRef = useRef(false);
  // Restore target for "Enter email manually" after a toggle to the element.
  const stashedEmailRef = useRef("");

  const switchToElement = () => {
    stashedEmailRef.current = form.getValues("email");
    userToggledRef.current = true;
    setEmailMode("element");
    // Clear so Continue disables until the element's onChange syncs a typed
    // email — form validation gates the submit button.
    form.setValue("email", "", { shouldValidate: true });
  };

  const switchToNative = () => {
    userToggledRef.current = true;
    setEmailMode("native");
    form.setValue(
      "email",
      stashedEmailRef.current || (defaultValues.email ?? ""),
      { shouldValidate: true },
    );
  };

  // Prefilled (native-input) path: validate once on mount so isValid reflects
  // the seeded email and the submit button enables without user interaction.
  useEffect(() => {
    if ((defaultValues.email ?? "").trim()) {
      void form.trigger("email");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync form when defaultValues.email is populated from cart (React Hook Form
  // defaultValues only apply on mount). Guarded by mode: a late prefill only
  // applies while in native mode, or on a not-yet-toggled element mount (where
  // it also switches to native, matching the pre-toggle render behavior). It
  // must NEVER override an explicit user toggle into the element (Link) mode.
  useEffect(() => {
    if (emailMode === "element" && userToggledRef.current) return;
    const incoming = defaultValues.email ?? "";
    const current = form.getValues("email");
    if (incoming && !current) {
      form.reset({
        email: incoming,
        newsletter: defaultValues.newsletter ?? false,
      });
      void form.trigger("email");
      if (emailMode === "element") setEmailMode("native");
    }
  }, [defaultValues.email, defaultValues.newsletter, form, emailMode]);

  const handleSubmit = async (data: z.infer<typeof contactSchema>) => {
    try {
      // Branch selection is extracted to a pure, unit-tested helper — the
      // "update-email" branch is what repairs the session-email wipe caused
      // by mounting a blank ContactDetailsElement (toggle roundtrip).
      const decision = decideContactSubmit({
        initialEmail: defaultValues.email ?? "",
        submittedEmail: data.email,
        sessionEmail:
          checkoutState.type === "success"
            ? (checkoutState.checkout.email ?? "")
            : null,
        hasRefreshSession: !!onRefreshSession,
      });

      // Recreate session only when email actually changed (avoids unnecessary session creation)
      if (decision === "recreate" && onRefreshSession) {
        const result = await updateCustomerAddressAction({
          billingAddress: { email: data.email },
        });
        if (!result.success) throw new Error(result.error);
        await onRefreshSession(
          data.email,
          CheckoutFormStepEnum.DELIVERY_METHOD,
        );
        return;
      }

      // Scene 2: email prefilled from cart and Stripe already has email.
      // When email unchanged, do NOT call updateEmail (Stripe forbids it). Just advance.
      if (decision === "advance") {
        onNext(data);
        return;
      }

      // Stripe has no email (or email changed): update Stripe session and cart
      if (actions) {
        const res = await actions.updateEmail(data.email);
        if (res.type === "error")
          throw new Error(res.error?.message ?? "Failed to update email");

        const updateResult = await actions.runServerUpdate(async () => {
          const result = await updateCustomerAddressAction({
            billingAddress: { email: data.email },
          });
          if (!result.success) throw new Error(result.error);
        });
        if (updateResult.type === "error") {
          throw new Error(
            updateResult.error?.message ?? "Failed to update email",
          );
        }
      } else {
        const res = await updateCustomerAddressAction({
          billingAddress: { email: data.email },
        });
        if (!res.success) throw new Error(res.error);
      }
      onNext(data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      });
      throw err;
    }
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {enableStripe && emailMode === "element" ? (
            <>
              {/* No options prop: in Checkout Sessions custom mode the element
                  accepts none (Record<string, never>) and the react wrapper
                  drops them anyway — it cannot prefill. Typing drives Link. */}
              <ContactDetailsElement
                onChange={(event) => {
                  form.setValue("email", event.value.email);
                  form.trigger("email");
                }}
              />
              {hasPrefillEmail && (
                <button
                  type="button"
                  onClick={switchToNative}
                  className="underline font-medium cursor-pointer text-sm text-muted-foreground"
                >
                  Enter email manually
                </button>
              )}
            </>
          ) : (
            <>
              <FormField
                name="email"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <input
                        type="email"
                        placeholder="Email"
                        className="border rounded-md p-2 w-full"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {enableStripe && hasPrefillEmail && (
                <button
                  type="button"
                  onClick={switchToElement}
                  className="underline font-medium cursor-pointer text-sm text-muted-foreground"
                >
                  Use Link instead
                </button>
              )}
            </>
          )}

          <FormField
            control={form.control}
            name="newsletter"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    Email me with the latest news, products and special offers.
                  </FormLabel>
                </div>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
            rightIcon="arrowRight"
          >
            {buttonLabel}
          </Button>
        </form>
      </Form>
    </div>
  );
};

export { ContactFormStep, type ContactFormStepProps };
