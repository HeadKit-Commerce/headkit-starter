"use client";

import { useCallback, useRef, useState } from "react";
import {
  PaymentElement,
  BillingAddressElement,
  useCheckout,
  CurrencySelectorElement,
} from "@stripe/react-stripe-js/checkout";
import type { AddressInput } from "@headkit/sdk";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SpinnerIcon } from "@/components/icon";
import { useCheckoutActions } from "@/app/checkout/checkout-actions-context";
import { writeBillingAddressCookie } from "@/lib/checkout-billing-cookie";
import { isCheckoutSessionDead } from "@/lib/checkout-session-status";

interface StripePaymentStepProps {
  /**
   * ENG-801: render the "Billing is same as shipping" checkbox. Only true on
   * Ship-to-Home (the flow that collected a shipping address). Click & Collect
   * and no-shipping flows collect billing at the BillingAddressStep instead.
   */
  showBillingSameAsShipping?: boolean;
  /**
   * Shipping address (from the delivery step) used to restore
   * billing = shipping on the session after an uncheck → re-check.
   */
  shippingAddress?: AddressInput | null;
  /**
   * ENG-784: the active Checkout Session id, used on a confirm error to ask
   * the SERVER whether the session is dead (status !== "open" — D7, never
   * error-string sniffing).
   */
  sessionId?: string;
  /**
   * ENG-784: called when a confirm error traces to a dead session — triggers
   * the one-shot auto-recreate with the cart-changed notice.
   */
  onSessionExpired?: () => void;
}

/** Billing value tracked from BillingAddressElement change events (ENG-801).
 * Note: the element does not return phone — the session phone is already set
 * from the shipping phone at the delivery step (accepted limitation). */
type BillingValue = {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

/**
 * Renders PaymentElement + confirm button inside a CheckoutProvider context.
 * Must be a child of <CheckoutProvider> (from @stripe/react-stripe-js/checkout).
 * Calls checkout.confirm() to finalise payment — on success Stripe handles the
 * redirect to the returnUrl configured on the session.
 *
 * ENG-801: on Ship-to-Home a "Billing is same as shipping" checkbox (default
 * checked) is rendered. Unchecking reveals an inline BillingAddressElement.
 * On Pay the element is UNMOUNTED first, then the entered billing is pushed
 * via actions.updateBillingAddress() before checkout.confirm(). The unmount
 * is required: Stripe rejects confirm() while a billing Address Element is
 * mounted if updateBillingAddress() was ever called on the session (the
 * delivery step's billing=shipping write already counts). Checked = today's
 * behavior; after an uncheck → Pay attempt, re-checking restores
 * billing = shipping via actions.updateBillingAddress().
 */
export function StripePaymentStep({
  showBillingSameAsShipping = false,
  shippingAddress = null,
  sessionId,
  onSessionExpired,
}: StripePaymentStepProps) {
  const checkoutState = useCheckout();
  const { actions } = useCheckoutActions();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingElementComplete, setBillingElementComplete] = useState(false);
  const [lastBillingValue, setLastBillingValue] = useState<BillingValue | null>(
    null,
  );
  // While true the BillingAddressElement is unmounted so confirm() can run
  // after updateBillingAddress() — Stripe rejects confirm() while a billing
  // Address Element is mounted if updateBillingAddress() was ever called on
  // the session (the delivery step's billing=shipping write already counts).
  const [hideBillingElement, setHideBillingElement] = useState(false);
  // Snapshot of the entered billing captured when the element is unmounted on
  // Pay; used as `contacts` prefill so a remount after a failed payment does
  // not lose what the customer typed (contacts is create-only — ENG-755).
  const [remountContacts, setRemountContacts] = useState<
    | {
        name: string;
        address: {
          line1: string;
          line2?: string;
          city: string;
          state: string;
          postal_code: string;
          country: string;
        };
      }[]
    | null
  >(null);
  // True only after a distinct billing address was SUCCESSFULLY pushed to the
  // session. Handles: uncheck → fill → Pay → updateBillingAddress succeeds →
  // confirm fails (e.g. declined card) → user re-checks → Pay must restore
  // billing = shipping before confirming (ENG-801).
  const billingOverriddenRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (checkoutState.type !== "success") return;
    const { checkout } = checkoutState;

    setIsSubmitting(true);
    setError(null);
    try {
      if (showBillingSameAsShipping && !billingSameAsShipping) {
        // Distinct billing: unmount the element, push the entered address,
        // then confirm. Stripe: "If you intend to use a different value,
        // ensure the Address Element is not mounted by the time you call
        // confirm()."
        if (!actions || !billingElementComplete || !lastBillingValue?.line1) {
          setError("Please complete your billing address");
          return;
        }
        const name = [lastBillingValue.firstName, lastBillingValue.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        const billingPayload = {
          ...(name ? { name } : {}),
          address: {
            line1: lastBillingValue.line1,
            ...(lastBillingValue.line2
              ? { line2: lastBillingValue.line2 }
              : {}),
            city: lastBillingValue.city,
            state: lastBillingValue.state,
            postal_code: lastBillingValue.postalCode,
            country: lastBillingValue.country,
          },
        };
        // Unmount the element (and keep its value as remount prefill). The
        // awaited network call below gives React time to commit the unmount
        // before confirm() runs.
        setRemountContacts([{ name, address: billingPayload.address }]);
        setHideBillingElement(true);
        const res = await actions.updateBillingAddress(billingPayload);
        if (res.type === "error") {
          setError(res.error?.message ?? "Failed to update billing address");
          return;
        }
        billingOverriddenRef.current = true;
        // Persist the entered billing for the success pages — the session
        // retrieve returns stale customer_details for a while after confirm,
        // so the cookie is the deterministic finalize source (ENG-801).
        writeBillingAddressCookie({
          firstName: lastBillingValue.firstName,
          lastName: lastBillingValue.lastName,
          address1: lastBillingValue.line1,
          address2: lastBillingValue.line2 ?? "",
          city: lastBillingValue.city,
          state: lastBillingValue.state,
          postcode: lastBillingValue.postalCode,
          country: lastBillingValue.country,
        });
      } else if (
        showBillingSameAsShipping &&
        billingSameAsShipping &&
        billingOverriddenRef.current
      ) {
        // Re-checked after a distinct billing was pushed: restore
        // billing = shipping on the session before confirming. Never confirm
        // with stale distinct billing while the UI claims "same as shipping".
        if (!actions || !shippingAddress?.address1) {
          setError(
            "Unable to restore your billing address. Please uncheck the box and enter a billing address.",
          );
          return;
        }
        const restoreName = [
          shippingAddress.firstName,
          shippingAddress.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        const restoreRes = await actions.updateBillingAddress({
          ...(restoreName ? { name: restoreName } : {}),
          address: {
            line1: shippingAddress.address1 ?? "",
            ...(shippingAddress.address2
              ? { line2: shippingAddress.address2 }
              : {}),
            city: shippingAddress.city ?? "",
            state: shippingAddress.state ?? "",
            postal_code: shippingAddress.postcode ?? "",
            country: shippingAddress.country ?? "",
          },
        });
        if (restoreRes.type === "error") {
          setError(
            restoreRes.error?.message ?? "Failed to update billing address",
          );
          return;
        }
        billingOverriddenRef.current = false;
      }

      if (
        showBillingSameAsShipping &&
        billingSameAsShipping &&
        shippingAddress?.address1
      ) {
        // Checked = billing IS the shipping address. Persist it so the
        // success pages never read a stale/distinct billing from a previous
        // attempt or from the lagging session retrieve (ENG-801).
        writeBillingAddressCookie({
          firstName: shippingAddress.firstName ?? "",
          lastName: shippingAddress.lastName ?? "",
          address1: shippingAddress.address1 ?? "",
          address2: shippingAddress.address2 ?? "",
          city: shippingAddress.city ?? "",
          state: shippingAddress.state ?? "",
          postcode: shippingAddress.postcode ?? "",
          country: shippingAddress.country ?? "",
          ...(shippingAddress.phone ? { phone: shippingAddress.phone } : {}),
        });
      }

      const result = await checkout.confirm();
      if (result.type === "error") {
        // ENG-784: a confirm error may mean the session was expired under us
        // (cart mutated in another tab → mechanism 1 fired). Ask the SERVER
        // for the session status (D7) — dead → one-shot auto-recreate; alive
        // → keep the existing inline error handling.
        if (
          sessionId &&
          onSessionExpired &&
          (await isCheckoutSessionDead(sessionId))
        ) {
          onSessionExpired();
          return;
        }
        setError(result.error.message ?? "Payment failed. Please try again.");
      }
    } catch (err) {
      if (
        sessionId &&
        onSessionExpired &&
        (await isCheckoutSessionDead(sessionId))
      ) {
        onSessionExpired();
        return;
      }
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsSubmitting(false);
      // Remount the element (prefilled via remountContacts) if the payment
      // did not redirect — e.g. declined card or a confirm error.
      setHideBillingElement(false);
    }
  }, [
    checkoutState,
    actions,
    showBillingSameAsShipping,
    billingSameAsShipping,
    billingElementComplete,
    lastBillingValue,
    shippingAddress,
    sessionId,
    onSessionExpired,
  ]);

  if (checkoutState.type === "loading") {
    return (
      <div className="flex items-center justify-center py-8">
        <SpinnerIcon className="h-5 w-5 animate-spin text-gray-400" />
        <span className="ml-3 text-sm text-gray-500">Loading payment…</span>
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-700">
          {checkoutState.error.message ?? "Failed to load payment form."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/*
        PAY-06: express / wallet checkout (Apple Pay / Google Pay / Link) is NOT
        here — it lives in <ExpressCheckoutTop /> at the top of the checkout page
        (components/checkout/express-checkout-top.tsx). Stripe allows only ONE
        ExpressCheckoutElement per CheckoutProvider; a second instance here threw
        "cannot create multiple instances" and crashed to the error boundary.
        This step is the card / Payment Element path only.
      */}
      <CurrencySelectorElement />
      <PaymentElement
        options={{
          fields: {
            billingDetails: {
              name: "never",
            },
          },
        }}
      />
      {showBillingSameAsShipping && (
        <div className="space-y-4">
          <div className="flex flex-row items-start space-x-2">
            <Checkbox
              id="billing-same-as-shipping"
              checked={billingSameAsShipping}
              onCheckedChange={(checked) => {
                setBillingSameAsShipping(checked === true);
                setError(null);
              }}
            />
            <label
              htmlFor="billing-same-as-shipping"
              className="text-sm font-medium leading-none"
            >
              Billing is same as shipping
            </label>
          </div>
          {!billingSameAsShipping && !hideBillingElement && (
            <BillingAddressElement
              // `contacts` (create-only, ENG-755) restores the entered value
              // after the Pay-flow unmount; remountContacts only changes while
              // the element is hidden, so options never change on a live mount.
              options={remountContacts ? { contacts: remountContacts } : {}}
              onChange={(event) => {
                if (event.complete && event.value) {
                  const { address, firstName, lastName, name } = event.value;
                  const first = (name?.split(" ")?.[0] || firstName) ?? "";
                  const last = (name?.split(" ")?.[1] || lastName) ?? "";
                  const addr = address ?? {};
                  const value: BillingValue = {
                    firstName: first,
                    lastName: last,
                    line1: addr.line1 ?? "",
                    line2: addr.line2 ?? "",
                    city: addr.city ?? "",
                    state: addr.state ?? "",
                    country: addr.country ?? "",
                    postalCode: addr.postal_code ?? "",
                  };
                  setLastBillingValue(value);
                  setBillingElementComplete(!!value.line1);
                } else {
                  setBillingElementComplete(false);
                }
              }}
            />
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <Button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={isSubmitting}
        loading={isSubmitting}
        className="w-full"
      >
        Pay Now
      </Button>
    </div>
  );
}
