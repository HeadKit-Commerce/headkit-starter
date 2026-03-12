"use client";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LinkAuthenticationElement } from "@stripe/react-stripe-js";
import { useCheckout } from "@stripe/react-stripe-js/checkout";
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

  // Sync form when defaultValues.email is populated from cart (React Hook Form defaultValues only apply on mount)
  useEffect(() => {
    const incoming = defaultValues.email ?? "";
    const current = form.getValues("email");
    if (incoming && !current) {
      form.reset({
        email: incoming,
        newsletter: defaultValues.newsletter ?? false,
      });
    }
  }, [defaultValues.email, defaultValues.newsletter, form]);

  const handleSubmit = async (data: z.infer<typeof contactSchema>) => {
    try {
      const initialEmail = (defaultValues.email ?? "").trim().toLowerCase();
      const submittedEmail = data.email.trim().toLowerCase();
      const emailChanged = submittedEmail !== initialEmail;

      const stripeHasNoEmail =
        checkoutState.type === "success" &&
        !checkoutState.checkout.email?.trim();

      // Recreate session only when email actually changed (avoids unnecessary session creation)
      if (onRefreshSession && emailChanged) {
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
      const hasInitialEmail = (defaultValues.email ?? "").trim().length > 0;
      if (!stripeHasNoEmail && hasInitialEmail && !emailChanged) {
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
          {enableStripe ? (
            <LinkAuthenticationElement
              options={{
                defaultValues: {
                  email: defaultValues.email ?? "",
                },
              }}
              onChange={(event) => {
                form.setValue("email", event.value.email);
                form.trigger("email");
              }}
            />
          ) : (
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
