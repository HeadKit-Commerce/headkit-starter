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

/**
 * Stripe Checkout Session address-element `contacts` entry.
 *
 * Official ShippingAddressElement options are `contacts` and `display` only.
 * Never include `phone` on contacts: BillingAddressElement is an Address
 * Element, and Stripe.js throws IntegrationError if `contacts[0].phone` is
 * set without AddressElement `fields.phone` / `validation.phone.required`
 * `'always'`. Phone is collected via PhoneInput + `updatePhoneNumber()`.
 * https://docs.stripe.com/js/custom_checkout/create_shipping_address_element
 */
export interface CheckoutShippingContactOption {
  name: string;
  address: StripeAddressSeed["address"];
}

/** Cart / form shipping address (AddressInput-shaped) used to seed billing contacts. */
export interface CheckoutShippingAddressInput {
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  address1?: string | null | undefined;
  address2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  country?: string | null | undefined;
  postcode?: string | null | undefined;
}

/**
 * Map an AddressInput-shaped shipping address onto the delivery-form seed
 * shape. Phone is intentionally dropped — it must not reach Stripe `contacts`.
 */
export function savedShippingFromAddressInput(
  addr: CheckoutShippingAddressInput | null | undefined,
): SavedShippingAddress | undefined {
  if (!addr) return undefined;
  return {
    firstName: addr.firstName ?? undefined,
    lastName: addr.lastName ?? undefined,
    line1: addr.address1 ?? undefined,
    line2: addr.address2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    country: addr.country ?? undefined,
    postalCode: addr.postcode ?? undefined,
  };
}

/**
 * Strip `phone` from any contact payload so Address / Billing elements never
 * receive `contacts[0].phone`.
 */
export function contactsWithoutPhone(
  contacts:
    | ReadonlyArray<{
        name: string;
        address: StripeAddressSeed["address"];
        phone?: string | undefined;
      }>
    | null
    | undefined,
): CheckoutShippingContactOption[] | undefined {
  if (!contacts?.length) return undefined;
  return contacts.map(({ name, address }) => ({ name, address }));
}

/**
 * Build `contacts` prefill for Shipping / Billing address elements.
 *
 * Name + address only. Saved-address phone stays on PhoneInput /
 * `updatePhoneNumber()` — never on `contacts`.
 */
export function buildCheckoutShippingContacts(
  addr: SavedShippingAddress | null | undefined,
): CheckoutShippingContactOption[] | undefined {
  const seed = buildStripeAddressSeed(addr);
  if (!seed) return undefined;
  return [
    {
      name: seed.name ?? "",
      address: seed.address,
    },
  ];
}

/**
 * Options for Checkout Session `createShippingAddressElement`.
 *
 * Allowed: `contacts` / `display`. Do NOT pass AddressElement `fields`
 * (e.g. `{ phone: "always" }`) — Stripe.js throws IntegrationError at create.
 *
 * Phone is NOT supported on ShippingAddressElement for Custom Checkout +
 * Adaptive Pricing (Stripe: use a separate UI + `updatePhoneNumber()`).
 * Session create still sets official `phone_number_collection[enabled]=true`.
 * https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-phone_number_collection
 */
export function buildCheckoutShippingAddressElementOptions(
  contacts: CheckoutShippingContactOption[] | undefined,
): { contacts: CheckoutShippingContactOption[] } | Record<string, never> {
  const clean = contactsWithoutPhone(contacts);
  if (!clean?.length) return {};
  return { contacts: clean };
}

/**
 * Options for Checkout Session BillingAddressElement.
 *
 * Prefer remount snapshot (failed Pay), else shipping address. Always strip
 * `phone` so a session phone from `updatePhoneNumber()` cannot leak into
 * `contacts[0].phone` (that IntegrationError requires AddressElement
 * `fields.phone: 'always'`, which we do not invent here).
 */
export function buildCheckoutBillingAddressElementOptions(args: {
  remountContacts?:
    | ReadonlyArray<{
        name: string;
        address: StripeAddressSeed["address"];
        phone?: string | undefined;
      }>
    | null
    | undefined;
  shippingAddress?: CheckoutShippingAddressInput | null | undefined;
}): { contacts: CheckoutShippingContactOption[] } | Record<string, never> {
  const fromRemount = contactsWithoutPhone(args.remountContacts);
  if (fromRemount?.length) return { contacts: fromRemount };
  return buildCheckoutShippingAddressElementOptions(
    buildCheckoutShippingContacts(
      savedShippingFromAddressInput(args.shippingAddress),
    ),
  );
}
