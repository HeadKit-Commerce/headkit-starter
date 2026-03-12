"use client";

import { useCallback, useState } from "react";
import {
  PaymentElement,
  useCheckout,
  CurrencySelectorElement,
} from "@stripe/react-stripe-js/checkout";
import { Button } from "@/components/ui/button";
import { SpinnerIcon } from "@/components/icon";

/**
 * Renders PaymentElement + confirm button inside a CheckoutProvider context.
 * Must be a child of <CheckoutProvider> (from @stripe/react-stripe-js/checkout).
 * Calls checkout.confirm() to finalise payment — on success Stripe handles the
 * redirect to the returnUrl configured on the session.
 */
export function StripePaymentStep() {
  const checkoutState = useCheckout();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (checkoutState.type !== "success") return;
    const { checkout } = checkoutState;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await checkout.confirm();
      if (result.type === "error") {
        setError(result.error.message ?? "Payment failed. Please try again.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [checkoutState]);

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
