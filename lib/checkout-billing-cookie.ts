/**
 * ENG-801: deterministic billing-address handoff from checkout to the success
 * pages.
 *
 * Stripe's session RETRIEVE returns a STALE customer_details for up to tens of
 * seconds after updateBillingAddress()/confirm() (the completed webhook EVENT
 * carries the fresh value, but the success pages read via retrieve). A billing
 * address entered seconds before Pay therefore never makes it onto the order
 * when derived from the session alone (repro: orders 783/784/785 landed
 * billing==shipping while Stripe held the distinct billing).
 *
 * The client is the source of truth at Pay time, so checkout writes the chosen
 * billing here (same pattern as the existing hk-checkout-data shipping cookie)
 * and the success pages prefer it over the session's customer_details.
 */

export const BILLING_ADDRESS_COOKIE = "hk-billing-address";

/** Billing address persisted for the success pages (AddressInput field names). */
export type BillingAddressCookie = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone?: string;
};

/** Writes the billing cookie (client-side only). */
export function writeBillingAddressCookie(addr: BillingAddressCookie): void {
  document.cookie = `${BILLING_ADDRESS_COOKIE}=${encodeURIComponent(
    JSON.stringify(addr),
  )};path=/;max-age=3600;SameSite=Lax`;
}

/** Clears the billing cookie (client-side only). */
export function clearBillingAddressCookie(): void {
  document.cookie = `${BILLING_ADDRESS_COOKIE}=;path=/;max-age=0;SameSite=Lax`;
}

/**
 * Parses a raw cookie value (server-side, pure). Returns null when absent,
 * malformed, or missing address1 — callers then fall back to the session.
 */
export function parseBillingAddressCookie(
  raw: string | undefined,
): BillingAddressCookie | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(
      decodeURIComponent(raw),
    ) as BillingAddressCookie | null;
    return value?.address1 ? value : null;
  } catch {
    return null;
  }
}
