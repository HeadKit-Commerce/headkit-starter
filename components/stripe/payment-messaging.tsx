"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentMethodMessagingElement,
} from "@stripe/react-stripe-js";

const VALID_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "DKK",
  "NOK",
  "SEK",
  "AUD",
  "CAD",
  "NZD",
] as const;

const VALID_COUNTRIES = [
  "US",
  "CA",
  "AU",
  "NZ",
  "GB",
  "IE",
  "FR",
  "ES",
  "DE",
  "AT",
  "BE",
  "DK",
  "FI",
  "IT",
  "NL",
  "NO",
  "SE",
] as const;

type ValidCurrency = (typeof VALID_CURRENCIES)[number];
type ValidCountry = (typeof VALID_COUNTRIES)[number];

export interface PaymentMethodMessagingProps {
  /** Price in major currency units (e.g. 49.99 for $49.99). */
  price: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
  countryCode: string;
  /** Stripe publishable key. */
  publishableKey: string;
  /** Stripe Connect account ID (optional). */
  stripeAccountId?: string | null;
  disabled?: boolean;
}

/**
 * Renders Stripe's PaymentMethodMessagingElement showing BNPL options
 * (Klarna, Afterpay, Affirm) for eligible currency/country combinations.
 *
 * This component manages its own Stripe instance. It is designed to be
 * dropped into any product or cart page that has access to the Stripe config
 * from the store settings.
 */
export function PaymentMethodMessaging({
  price,
  currency,
  countryCode,
  publishableKey,
  stripeAccountId,
  disabled = false,
}: PaymentMethodMessagingProps) {
  const normalizedCurrency = currency.toUpperCase() as ValidCurrency;
  const normalizedCountry = countryCode.toUpperCase() as ValidCountry;

  const isValidCurrency = (VALID_CURRENCIES as readonly string[]).includes(
    normalizedCurrency,
  );
  const isValidCountry = (VALID_COUNTRIES as readonly string[]).includes(
    normalizedCountry,
  );

  const [stripePromise, setStripePromise] = useState<ReturnType<
    typeof loadStripe
  > | null>(null);
  useEffect(() => {
    if (!publishableKey || !isValidCurrency || !isValidCountry) {
      setStripePromise(null);
      return;
    }
    setStripePromise(
      loadStripe(publishableKey, {
        ...(stripeAccountId ? { stripeAccount: stripeAccountId } : {}),
      }),
    );
  }, [publishableKey, stripeAccountId, isValidCurrency, isValidCountry]);

  if (disabled || !isValidCurrency || !isValidCountry || !stripePromise) {
    return null;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        // Inherit storefront fonts — no remote Google Fonts CSS for Stripe.
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#23102E",
            colorText: "#23102E",
            colorTextSecondary: "#23102E",
            fontSizeBase: "16px",
            spacingUnit: "10px",
            fontFamily: "var(--font-body), system-ui, sans-serif",
          },
        },
        currency: normalizedCurrency.toLowerCase(),
      }}
    >
      <PaymentMethodMessagingElement
        options={{
          amount: Math.round(price * 100),
          currency: normalizedCurrency,
          paymentMethodTypes: ["klarna", "afterpay_clearpay", "affirm"],
          countryCode: normalizedCountry,
        }}
      />
    </Elements>
  );
}
