/** Delivery-form shipping address shape (delivery-method-step defaultValues). */
export interface SavedShippingAddress {
  firstName?: string | undefined;
  lastName?: string | undefined;
  line1?: string | undefined;
  line2?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
  postalCode?: string | undefined;
  phone?: string | undefined;
}

/** Stripe updateShippingAddress/updateBillingAddress payload. */
export interface StripeAddressSeed {
  name?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

/**
 * Build the Sessions-native Stripe address-seed payload from the saved WP
 * address (CKA-04/CKA-05) for `actions.updateShippingAddress`/
 * `updateBillingAddress`.
 *
 * Returns `null` when there is no seedable address (guest / no saved address) so
 * the caller fires no update — the guest path stays unchanged and no create-only
 * `contacts` 400 (ENG-755) can occur.
 *
 * Requires `line1` + an ISO `country` (Stripe requires a country on the
 * address). An empty `line2` is omitted rather than sent as `""`. Country is
 * passed through as the ISO 2-letter code the cart already carries (never a
 * display name). All fields are trimmed; missing city/state/postcode default to
 * `""`. Pure — no I/O.
 */
export function buildStripeAddressSeed(
  addr: SavedShippingAddress | null | undefined,
): StripeAddressSeed | null {
  const line1 = addr?.line1?.trim();
  const country = addr?.country?.trim();
  if (!line1 || !country) return null;

  const line2 = addr?.line2?.trim();
  const name = [addr?.firstName, addr?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const seed: StripeAddressSeed = {
    address: {
      line1,
      ...(line2 ? { line2 } : {}),
      city: addr?.city?.trim() ?? "",
      state: addr?.state?.trim() ?? "",
      postal_code: addr?.postalCode?.trim() ?? "",
      country,
    },
  };
  if (name) seed.name = name;
  return seed;
}
