export enum CheckoutFormStepEnum {
  CONTACT = "Contact",
  DELIVERY_METHOD = "Delivery",
  ADDRESS = "Address",
  PAYMENT = "Payment",
}

export enum DeliveryStepEnum {
  CLICK_AND_COLLECT = "Free Click & Collect",
  SHIPPING_TO_HOME = "Ship to Home",
}

/**
 * Allowed countries for checkout (e.g. phone input default list, or backend session config).
 * Read from NEXT_PUBLIC_CHECKOUT_ALLOWED_COUNTRIES (comma-separated ISO codes)
 * or default to AU and NZ.
 * Note: Stripe Checkout Session address restrictions (if any) are set by the backend when creating the session.
 */
export function getCheckoutAllowedCountries(): string[] {
  if (typeof process.env.NEXT_PUBLIC_CHECKOUT_ALLOWED_COUNTRIES === "string") {
    return process.env.NEXT_PUBLIC_CHECKOUT_ALLOWED_COUNTRIES.split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return ["AU", "NZ"];
}

/** Minimum digit count for checkout phone validation (lenient; accepts national or E.164). */
const CHECKOUT_PHONE_MIN_DIGITS = 8;

/**
 * Lenient phone validation for checkout: non-empty and at least 8 digits.
 * Accepts national format (e.g. 0444444444), E.164 (+61444444444), or mixed.
 */
export function isValidCheckoutPhone(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= CHECKOUT_PHONE_MIN_DIGITS;
}

/** Zod refinement message for checkout phone. */
export const CHECKOUT_PHONE_MESSAGE =
  "Enter a valid phone number (at least 8 digits)";

/** Stripe ContactOption shape for Address Element options.contacts */
export type StripeContactOption = {
  name: string;
  address: {
    line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    line2?: string;
  };
};

/**
 * Converts cart/defaultValues address to Stripe Address Element contacts array.
 * Returns undefined when addr has no line1; otherwise returns one-element array for options.contacts.
 */
export function cartAddressToStripeContacts(
  addr:
    | {
        firstName?: string | undefined;
        lastName?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        state?: string | undefined;
        country?: string | undefined;
        postalCode?: string | undefined;
      }
    | null
    | undefined,
): StripeContactOption[] | undefined {
  if (!addr?.line1?.trim()) return undefined;
  const name =
    [addr.firstName, addr.lastName].filter(Boolean).join(" ").trim() || "";
  return [
    {
      name,
      address: {
        line1: addr.line1 ?? "",
        city: addr.city ?? "",
        state: addr.state ?? "",
        postal_code: addr.postalCode ?? "",
        country: addr.country ?? "",
        ...(addr.line2?.trim() ? { line2: addr.line2 } : {}),
      },
    },
  ];
}
