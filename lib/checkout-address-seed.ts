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
 * Pickup location fields used to recognise a Click & Collect store
 * address that leaked onto the Woo customer / cart. Street match is
 * against `address` or `name` (some locations put the shop name in
 * line 1).
 */
export type PickupLocationMatchInput = {
  name: string;
  address: string;
  city: string;
  postcode: string;
  countryCode: string;
};

/**
 * True when `addr` is a Click & Collect pickup location rather than a
 * personal home address. Returning-user checkout must not offer that
 * as Stripe's "Saved address" on Ship to home.
 */
export function isPickupLocationAddress(
  addr: SavedShippingAddress | null | undefined,
  locations: readonly PickupLocationMatchInput[] | undefined,
): boolean {
  if (addr == null || locations == null || locations.length === 0) {
    return false;
  }
  const line1 = normalizeAddressPart(addr.line1);
  const city = normalizeAddressPart(addr.city);
  const postcode = normalizeAddressPart(addr.postalCode);
  const country = normalizeAddressPart(addr.country);
  if (line1 === "") {
    return false;
  }
  return locations.some((loc) => {
    const locStreet = normalizeAddressPart(loc.address);
    const locName = normalizeAddressPart(loc.name);
    const streetHit =
      line1 === locStreet || (locName !== "" && line1 === locName);
    if (!streetHit) {
      return false;
    }
    if (country !== "" && normalizeAddressPart(loc.countryCode) !== country) {
      return false;
    }
    const locPostcode = normalizeAddressPart(loc.postcode);
    if (postcode !== "" && locPostcode !== "") {
      return postcode === locPostcode;
    }
    const locCity = normalizeAddressPart(loc.city);
    if (city !== "" && locCity !== "") {
      return city === locCity || city === "pickup";
    }
    return locStreet !== "" || locName !== "";
  });
}

/**
 * Cart / customer shipping that is safe to seed as a personal address.
 * Pickup-location leftovers return `undefined`.
 */
export function personalSavedShippingAddress(
  addr: SavedShippingAddress | null | undefined,
  locations: readonly PickupLocationMatchInput[] | undefined,
): SavedShippingAddress | undefined {
  if (addr == null || isPickupLocationAddress(addr, locations)) {
    return undefined;
  }
  return addr;
}

/**
 * Same filter for a Woo `AddressInput` (cart seed on checkout load).
 * Returns the original object so callers keep phone / email fields.
 */
export function personalSavedAddressInput<
  T extends CheckoutShippingAddressInput,
>(
  addr: T | null | undefined,
  locations: readonly PickupLocationMatchInput[] | undefined,
): T | undefined {
  if (addr == null) {
    return undefined;
  }
  const checkout = savedShippingFromAddressInput(addr);
  if (checkout == null || isPickupLocationAddress(checkout, locations)) {
    return undefined;
  }
  return addr;
}

/**
 * Build `contacts` prefill for Shipping / Billing address elements.
 *
 * Name + address only. Saved-address phone stays on PhoneInput /
 * `updatePhoneNumber()` — never on `contacts`.
 *
 * Click & Collect store addresses are omitted when `pickupLocations`
 * is passed — they must not appear as Stripe's "Saved address".
 */
export function buildCheckoutShippingContacts(
  addr: SavedShippingAddress | null | undefined,
  pickupLocations: readonly PickupLocationMatchInput[] | undefined = [],
): CheckoutShippingContactOption[] | undefined {
  const personal = personalSavedShippingAddress(addr, pickupLocations);
  const seed = buildStripeAddressSeed(personal);
  if (!seed) return undefined;
  return [
    {
      name: seed.name ?? "",
      address: seed.address,
    },
  ];
}

function normalizeAddressPart(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
 * Options for the PAYMENT step's BillingAddressElement.
 *
 * `contacts` here is a RECOVERY prefill only — the snapshot of a distinct
 * billing address the shopper already typed, captured when the element is
 * unmounted on Pay so a failed confirm does not lose it (`contacts` is
 * create-only, ENG-755).
 *
 * NEVER seed it from the shipping address on first mount. The payment step's
 * Elements instance runs with `syncAddressCheckbox: "billing"`
 * (`app/checkout/CheckoutForm.tsx`), and Stripe renders that native
 * "billing address same as shipping" checkbox only for an UNSEEDED billing
 * element. Given `contacts`, the element renders the saved-address card
 * ("<name> / <line1> / Change") instead and the checkbox never appears —
 * observed on staging run 33193675514, where the failure surfaced as
 * `expectBillingSameAsShippingControl` timing out with the card in the
 * snapshot. The shipping address needs no prefill anyway: with the checkbox
 * ticked Stripe reuses it, and the delivery step already pushed
 * `updateBillingAddress(shipping)` to the session.
 *
 * Always strip `phone` so a session phone from `updatePhoneNumber()` cannot
 * leak into `contacts[0].phone` (that IntegrationError requires AddressElement
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
}): { contacts: CheckoutShippingContactOption[] } | Record<string, never> {
  const fromRemount = contactsWithoutPhone(args.remountContacts);
  if (!fromRemount?.length) return {};
  return { contacts: fromRemount };
}
