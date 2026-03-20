"use client";

import { useState } from "react";
import {
  ExpressCheckoutElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import type { StripeExpressCheckoutElementReadyEvent } from "@stripe/stripe-js";

/**
 * Renders Apple Pay / Google Pay / Link express checkout buttons.
 * Must be a child of <CheckoutProvider>.
 * Hidden entirely when no wallet methods are available in the browser.
 */
export function ExpressCheckoutSection() {
  const checkoutState = useCheckout();
  const [hasPaymentMethods, setHasPaymentMethods] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onReady = (event: StripeExpressCheckoutElementReadyEvent) => {
    const available = event.availablePaymentMethods;
    setHasPaymentMethods(available != null && Object.keys(available).length > 0);
  };

  const onConfirm = async () => {
    if (checkoutState.type !== "success") return;
    setError(null);
    const result = await checkoutState.checkout.confirm();
    if (result.type === "error") {
      setError(result.error.message ?? "Payment failed. Please try again.");
    }
  };

  // Keep element mounted (hidden) so Stripe can probe wallet availability
  return (
    <div className={hasPaymentMethods ? "mb-4 space-y-3" : "sr-only"}>
      <ExpressCheckoutElement onReady={onReady} onConfirm={onConfirm} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wide text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  );
}
