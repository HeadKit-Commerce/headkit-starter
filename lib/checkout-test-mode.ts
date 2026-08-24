/**
 * Checkout test-mode helpers.
 *
 * Commerce already returns `testMode` on createCheckoutSession. The storefront
 * used to drop that field, so testers had no on-page reminder of the Stripe
 * cards. Gate on commerce's flag AND the publishable key prefix so a live
 * `pk_live_` never paints test cards even if a leftover flag is wrong.
 */

export type CheckoutTestModeInput = {
  testMode?: boolean | null;
  publishableKey?: string | null;
};

export type StripeTestCard = {
  id: "succeed" | "decline" | "authentication";
  label: string;
  /** Digits only — format for display / clipboard with formatTestCardNumber. */
  number: string;
  description: string;
};

/**
 * Official Stripe test PANs (https://docs.stripe.com/testing#cards).
 * Copied as spaced groups so they paste cleanly into Payment Element.
 */
export const STRIPE_TEST_CARDS: readonly StripeTestCard[] = [
  {
    id: "succeed",
    label: "Succeeds",
    number: "4242424242424242",
    description: "Visa — payment is approved",
  },
  {
    id: "decline",
    label: "Declined",
    number: "4000000000000002",
    description: "Generic decline",
  },
  {
    id: "authentication",
    label: "3D Secure",
    number: "4000002760003184",
    description: "Requires authentication",
  },
];

/**
 * True when this checkout session is on platform test keys.
 * A live publishable key always wins (never show test cards on a live charge).
 */
export function isStripeTestCheckout(session: CheckoutTestModeInput): boolean {
  const pk = session.publishableKey?.trim() ?? "";
  if (pk.startsWith("pk_live_")) {
    return false;
  }
  if (session.testMode === true) {
    return true;
  }
  return pk.startsWith("pk_test_");
}

/** Group a PAN into 4-digit blocks for display and copy. */
export function formatTestCardNumber(digits: string): string {
  const only = digits.replace(/\D/g, "");
  return only.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** Copy `value` to the clipboard. Returns false when the API is unavailable. */
export async function copyTestCardNumber(value: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
