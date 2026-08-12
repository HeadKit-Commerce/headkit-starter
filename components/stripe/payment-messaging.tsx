"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentMethodMessagingElement,
} from "@stripe/react-stripe-js";
import { buildCheckoutAppearance } from "@/lib/stripe-appearance";

/**
 * Currencies the Payment Method Messaging Element accepts — the full 12-member
 * union from `StripePaymentMethodMessagingElementOptions["currency"]`
 * (`@stripe/stripe-js` `payment-method-messaging.d.ts`). This gate exists purely
 * to avoid downloading ~247 KB of Stripe.js on a storefront where no plan could
 * ever be eligible. Stripe still makes the final eligibility decision.
 */
const VALID_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "NOK",
  "NZD",
  "PLN",
  "SEK",
  "USD",
] as const;

type ValidCurrency = (typeof VALID_CURRENCIES)[number];

function isValidCurrency(currency: string): currency is ValidCurrency {
  return (VALID_CURRENCIES as readonly string[]).includes(currency);
}

export interface PaymentMethodMessagingProps {
  /** Price in major units for the CURRENTLY SELECTED variant (e.g. 9.99). */
  price: number;
  /** ISO 4217 currency code. */
  currency: string;
  publishableKey: string;
  /** Connect account id. Required for direct-charge platforms — see below. */
  stripeAccountId?: string | null;
  /** The store's dashboard toggle. */
  enabled: boolean;
  /** True when the product cannot be bought (out of stock). */
  disabled?: boolean;
}

/** Pure gate, exported for test. Cheap checks only — no Stripe involvement. */
export function shouldRenderMessaging(a: {
  publishableKey: string;
  currency: string;
  enabled: boolean;
  disabled?: boolean;
}): boolean {
  if (!a.enabled || a.disabled) return false;
  if (!a.publishableKey) return false;
  return isValidCurrency(a.currency.toUpperCase());
}

/**
 * Stripe's Payment Method Messaging Element — the "4 interest-free payments of
 * $X" badge.
 *
 * TWO THINGS HERE ARE LATE-BOUND ON PURPOSE.
 *
 * 1. `paymentMethodTypes` is NOT passed. Stripe's docs: "If you use Dynamic
 *    payment methods, the Payment Method Messaging Element automatically pulls
 *    your payment method preferences from the Stripe Dashboard." Commerce runs
 *    dynamic payment methods, so omitting the option is what makes this badge
 *    reflect the MERCHANT's own enabled providers, currency and amount. Every
 *    previous HeadKit implementation passed ["klarna","afterpay_clearpay",
 *    "affirm"], which silently opted out of exactly that. The option is
 *    optional in `StripePaymentMethodMessagingElementOptions`, so it is simply
 *    omitted rather than passed as `undefined`.
 *
 * 2. `stripeAccount` IS passed. Commerce creates DIRECT charges on the connected
 *    account, and Stripe requires direct-charge platforms to identify the
 *    account that renders this element. Without it the badge would describe the
 *    PLATFORM's payment methods, not the merchant's.
 *
 * `countryCode` is deliberately omitted — it is optional and Stripe infers the
 * buyer's country, which is more accurate than anything we could pass.
 *
 * CORE WEB VITALS. Stripe.js is ~247 KB and this badge is decorative, so it must
 * never compete with hydration or LCP. An earlier integration was withdrawn for
 * exactly that reason; it used dynamic import + a Suspense skeleton but still
 * requested Stripe.js from a mount effect, i.e. in the initial burst. Here the
 * script is requested only when the badge scrolls near the viewport. Measured on
 * the live PDP, loading it after the page settles costs 0 ms of long-task time
 * and 0 CLS.
 *
 * EMPTY STATE. Stripe renders nothing when no plan is eligible, so no height is
 * reserved — a reserved height would leave a permanent gap on every ineligible
 * store or amount.
 */
export function PaymentMethodMessaging({
  price,
  currency,
  publishableKey,
  stripeAccountId,
  enabled,
  disabled = false,
}: PaymentMethodMessagingProps): React.ReactElement | null {
  const gate = shouldRenderMessaging({
    publishableKey,
    currency,
    enabled,
    disabled,
  });

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);

  // Request Stripe.js only when the badge is close to the viewport.
  useEffect(() => {
    if (!gate || near) return;
    const node = hostRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [gate, near]);

  const stripePromise = useMemo(() => {
    if (!gate || !near) return null;
    return loadStripe(publishableKey, {
      ...(stripeAccountId ? { stripeAccount: stripeAccountId } : {}),
    });
  }, [gate, near, publishableKey, stripeAccountId]);

  const appearance = useMemo(() => buildCheckoutAppearance(), []);

  if (!gate) return null;

  const normalizedCurrency = currency.toUpperCase();
  if (!isValidCurrency(normalizedCurrency)) return null;

  // The host div is always present once gated in, so the observer has something
  // to watch. It has no height of its own until Stripe fills it.
  return (
    <div ref={hostRef} data-testid="bnpl-messaging">
      {stripePromise && price > 0 ? (
        <Elements
          stripe={stripePromise}
          options={{ appearance, currency: normalizedCurrency.toLowerCase() }}
        >
          <PaymentMethodMessagingElement
            options={{
              amount: Math.round(price * 100),
              currency: normalizedCurrency,
            }}
          />
        </Elements>
      ) : null}
    </div>
  );
}
