"use client";

import { useState } from "react";
import {
  ExpressCheckoutElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import type {
  StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import { isCheckoutSessionDead } from "@/lib/checkout-session-status";

/**
 * Express / wallet checkout (Apple Pay / Google Pay / Link) mounted at the TOP
 * of the checkout page, above the contact/email step. This is Stripe's canonical
 * placement so a buyer can pay in one tap and skip the form entirely.
 *
 * Shipping: in Checkout Sessions custom mode the wallet sheet collects the
 * shipping address and rate from the Checkout Session itself (the server sets
 * `shipping_address_collection` + `shipping_options`), so NO
 * `onShippingAddressChange` / `onShippingRateChange` wiring is needed here.
 *
 * Single-instance rule: exactly one ExpressCheckoutElement may exist per
 * CheckoutProvider. This is THE instance — it was removed from the Payment step
 * (stripe-checkout-step) to avoid Stripe's "cannot create multiple instances"
 * crash.
 *
 * Empty state: the element renders nothing when the device/browser has no
 * available wallet. The element stays mounted (so it can report availability),
 * but the surrounding label + divider only render once
 * `onAvailablePaymentMethodsChange` reports at least one method — so unsupported
 * browsers see no empty gap or dangling "Or" divider.
 *
 * Failure signaling (ENG-789): every confirm failure path calls
 * `event.paymentFailed({ reason: "fail" })` so the wallet sheet itself shows
 * the failure state instead of silently closing while the error only appears
 * inline on the page beneath. The inline message is kept as the on-page
 * fallback.
 */
export function ExpressCheckoutTop({
  sessionId,
  onSessionExpired,
}: {
  /** ENG-784: active Checkout Session id for confirm-time dead-session checks. */
  sessionId?: string;
  /** ENG-784: called when a confirm failure traces to a dead session (D7). */
  onSessionExpired?: () => void;
} = {}): React.ReactElement {
  const checkoutState = useCheckout();
  const [hasWallet, setHasWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ENG-784: a wallet confirm failure may mean the session was expired under
  // us (cart mutated in another tab → mechanism 1). Ask the SERVER for the
  // session status (D7 — never error-string sniffing); dead → one-shot
  // auto-recreate via onSessionExpired, alive → keep inline error handling.
  const recoverIfSessionDead = async (): Promise<boolean> => {
    if (!sessionId || !onSessionExpired) return false;
    if (!(await isCheckoutSessionDead(sessionId))) return false;
    onSessionExpired();
    return true;
  };

  const handleConfirm = (
    event: StripeExpressCheckoutElementConfirmEvent,
  ): void => {
    if (checkoutState.type !== "success") {
      // Checkout state not ready — confirm cannot proceed at all. Signal the
      // wallet sheet so it shows a failure instead of silently closing.
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const { checkout } = checkoutState;
    setError(null);
    void checkout
      .confirm({ expressCheckoutConfirmEvent: event })
      .then(async (result) => {
        if (result.type === "error") {
          event.paymentFailed({ reason: "fail" });
          if (await recoverIfSessionDead()) return;
          setError(result.error.message ?? "Payment failed. Please try again.");
        }
      })
      .catch(async (err: unknown) => {
        event.paymentFailed({ reason: "fail" });
        if (await recoverIfSessionDead()) return;
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred.",
        );
      });
  };

  const handleAvailablePaymentMethodsChange = (
    event: StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent,
  ): void => {
    setHasWallet(Boolean(event.paymentMethods));
  };

  return (
    <div data-testid="express-checkout-section">
      {hasWallet && (
        <p className="mb-3 text-sm font-medium text-gray-700">
          Express checkout
        </p>
      )}
      {/* Always mounted so Stripe can report wallet availability; renders empty
          (zero height) when no wallet is supported on this device/browser. */}
      <div data-testid="express-checkout">
        <ExpressCheckoutElement
          options={{
            // Force the wallet buttons to render whenever the platform supports
            // them, instead of the default "auto" (which only shows when the
            // buyer is already signed in / Stripe deems it advantageous, and
            // never shows Apple Pay on desktop Chromium). "always" shows the
            // button even when the buyer isn't logged in, opening a sign-in /
            // add-card flow on tap.
            // https://docs.stripe.com/js/elements_object/create_express_checkout_element
            paymentMethods: {
              applePay: "always",
              googlePay: "always",
            },
            // The Checkout-subpath options type requires every key; leave the
            // rest at their Stripe defaults.
            buttonHeight: undefined,
            buttonTheme: undefined,
            buttonType: undefined,
            layout: undefined,
            paymentMethodOrder: undefined,
          }}
          onConfirm={handleConfirm}
          onAvailablePaymentMethodsChange={handleAvailablePaymentMethodsChange}
        />
      </div>
      {hasWallet && error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {hasWallet && (
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Or
          </span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      )}
    </div>
  );
}
