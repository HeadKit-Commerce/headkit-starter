"use client";

import {
  VisaIcon,
  MastercardIcon,
  AmexIcon,
  DiscoverIcon,
  ApplePayIcon,
  GooglePayIcon,
  PayPalIcon,
  CreditCardIcon,
} from "@/components/icon";
import type { IconType } from "react-icons";

interface PaymentMethodDisplayProps {
  /** Card brand from Stripe (visa, mastercard, amex, discover, etc.) — preferred when available */
  cardBrand?: string | null | undefined;
  /** Last 4 digits of card */
  cardLast4?: string | null | undefined;
  /** Payment method type from Stripe (card, paypal, etc.) */
  paymentMethod?: string | null | undefined;
  /** Formatted label from WooCommerce, e.g. "Mastercard ending 4444", "PayPal" */
  paymentMethodTitle?: string | null | undefined;
  /** Fallback when no payment info available, e.g. order.status */
  fallback?: string;
}

const CARD_BRAND_ICON_MAP: Record<string, IconType> = {
  visa: VisaIcon,
  mastercard: MastercardIcon,
  amex: AmexIcon,
  american_express: AmexIcon,
  discover: DiscoverIcon,
  diners: CreditCardIcon,
  diners_club: CreditCardIcon,
  jcb: CreditCardIcon,
  unionpay: CreditCardIcon,
};

/** Extract brand and last4 from WooCommerce paymentMethodTitle format */
function parsePaymentMethodTitle(
  title: string,
): { brand: string; last4: string } | null {
  const t = title.trim();
  if (!t) return null;

  // "PayPal" — no card details
  if (t.toLowerCase() === "paypal") return null;

  // "Apple Pay - Visa ending 1234" or "Mastercard ending 4444"
  const endingMatch = t.match(/ending\s+(\d{4})\b/i);
  const last4: string = endingMatch?.[1] ?? "";

  // Determine brand from start of string
  const lower = t.toLowerCase();
  if (lower.startsWith("apple pay")) return { brand: "apple_pay", last4 };
  if (lower.startsWith("google pay")) return { brand: "google_pay", last4 };
  if (lower.startsWith("visa")) return { brand: "visa", last4 };
  if (lower.startsWith("mastercard")) return { brand: "mastercard", last4 };
  if (lower.startsWith("amex") || lower.startsWith("american express"))
    return { brand: "amex", last4 };
  if (lower.startsWith("discover")) return { brand: "discover", last4 };

  return last4 ? { brand: "unknown", last4 } : null;
}

function getPaymentIcon(brand: string): IconType {
  if (brand === "apple_pay") return ApplePayIcon;
  if (brand === "google_pay") return GooglePayIcon;
  const icon = CARD_BRAND_ICON_MAP[brand];
  return icon ?? CreditCardIcon;
}

export function PaymentMethodDisplay({
  cardBrand,
  cardLast4,
  paymentMethod,
  paymentMethodTitle,
  fallback = "Paid",
}: PaymentMethodDisplayProps) {
  // Prefer structured session data (cardBrand + cardLast4)
  if (cardBrand && cardLast4 && paymentMethod !== "paypal") {
    const Icon = getPaymentIcon(cardBrand.toLowerCase());
    return (
      <span className="inline-flex items-center gap-2">
        <Icon aria-hidden className="h-5 w-5 shrink-0" />
        <span>End with {cardLast4}</span>
      </span>
    );
  }

  // PayPal from session
  if (paymentMethod === "paypal") {
    return (
      <span className="inline-flex items-center gap-2">
        <PayPalIcon aria-hidden className="h-5 w-5 shrink-0" />
        <span>PayPal</span>
      </span>
    );
  }

  // Parse paymentMethodTitle from WooCommerce
  if (paymentMethodTitle) {
    const parsed = parsePaymentMethodTitle(paymentMethodTitle);
    if (parsed) {
      if (parsed.brand === "unknown") {
        return (
          <span className="inline-flex items-center gap-2">
            <CreditCardIcon aria-hidden className="h-5 w-5 shrink-0" />
            <span>End with {parsed.last4}</span>
          </span>
        );
      }
      if (parsed.brand === "apple_pay" || parsed.brand === "google_pay") {
        const Icon = getPaymentIcon(parsed.brand);
        return (
          <span className="inline-flex items-center gap-2">
            <Icon aria-hidden className="h-5 w-5 shrink-0" />
            <span>
              {parsed.last4
                ? `End with ${parsed.last4}`
                : parsed.brand === "apple_pay"
                  ? "Apple Pay"
                  : "Google Pay"}
            </span>
          </span>
        );
      }
      const Icon = getPaymentIcon(parsed.brand);
      return (
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden className="h-5 w-5 shrink-0" />
          <span>End with {parsed.last4}</span>
        </span>
      );
    }
    // PayPal from title
    if (paymentMethodTitle.trim().toLowerCase() === "paypal") {
      return (
        <span className="inline-flex items-center gap-2">
          <PayPalIcon aria-hidden className="h-5 w-5 shrink-0" />
          <span>PayPal</span>
        </span>
      );
    }
    // Unparseable — show raw title
    return <span className="capitalize">{paymentMethodTitle}</span>;
  }

  return <span className="capitalize">{fallback}</span>;
}
