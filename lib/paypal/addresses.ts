import type { AddressInput } from "@headkit/sdk";
import type { PayPalAddress, PayPalOrder } from "@/lib/paypal/client";

/**
 * The addresses a PayPal order is finalised with.
 *
 * **The CART wins, and PayPal is only the fallback.** Contact and Delivery are
 * Stripe-owned steps that the shopper walks BEFORE the PayPal button appears,
 * and everything they entered is already on the WooCommerce cart session. That
 * is the address the shipping rate was quoted against and the one the total
 * was computed from, so it is the one the order must carry. PayPal's payer
 * address is whatever is on the buyer's PayPal profile — frequently a
 * different, older address — and letting it win would ship the parcel
 * somewhere the shopper did not choose and did not see priced.
 *
 * PayPal is consulted only where the cart is genuinely empty, which in
 * practice is the webhook fallback on a session whose address writes did not
 * land.
 */

/** The address shape the cart returns (all fields present, possibly empty). */
export interface CartAddressLike {
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
}

function nonEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** True when an address carries enough for WooCommerce to accept an order. */
export function isUsableAddress(
  address: CartAddressLike | null | undefined,
): boolean {
  return !!address && nonEmpty(address.address1).length > 0;
}

export function cartAddressToInput(
  address: CartAddressLike | null | undefined,
  email?: string | undefined,
): AddressInput {
  return {
    firstName: nonEmpty(address?.firstName),
    lastName: nonEmpty(address?.lastName),
    address1: nonEmpty(address?.address1),
    address2: nonEmpty(address?.address2),
    city: nonEmpty(address?.city),
    state: nonEmpty(address?.state),
    postcode: nonEmpty(address?.postcode),
    country: nonEmpty(address?.country),
    ...(nonEmpty(address?.phone) ? { phone: nonEmpty(address?.phone) } : {}),
    ...(email ? { email } : {}),
  };
}

/** PayPal's address fields, mapped onto WooCommerce's. */
export function payPalAddressToCartAddress(
  address: PayPalAddress | undefined,
  name?: { firstName?: string | undefined; lastName?: string | undefined },
): CartAddressLike | null {
  if (!address?.address_line_1) return null;
  return {
    firstName: name?.firstName ?? "",
    lastName: name?.lastName ?? "",
    address1: address.address_line_1,
    address2: address.address_line_2 ?? "",
    // PayPal's admin_area_1 is the state/province and admin_area_2 the city.
    city: address.admin_area_2 ?? "",
    state: address.admin_area_1 ?? "",
    postcode: address.postal_code ?? "",
    country: address.country_code ?? "",
  };
}

/** Split PayPal's `shipping.name.full_name` the way WooCommerce needs it. */
export function splitFullName(fullName: string | undefined): {
  firstName: string;
  lastName: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1)
    return { firstName: parts[0] as string, lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1] as string,
  };
}

export interface ResolvedPayPalAddresses {
  billingAddress: AddressInput;
  shippingAddress: AddressInput;
  billingEmail: string | undefined;
}

/**
 * Resolve the pair the finalize needs, cart first.
 *
 * `shippingAddress` falls back to the billing address rather than staying
 * empty: WooCommerce requires both, and a pickup order legitimately has no
 * separate delivery address.
 */
export function resolvePayPalAddresses(args: {
  cartBilling: CartAddressLike | null | undefined;
  cartShipping: CartAddressLike | null | undefined;
  paypalOrder: PayPalOrder | null | undefined;
}): ResolvedPayPalAddresses {
  const unit = args.paypalOrder?.purchase_units?.[0];
  const payer = args.paypalOrder?.payer;

  const paypalBilling = payPalAddressToCartAddress(payer?.address, {
    firstName: payer?.name?.given_name ?? "",
    lastName: payer?.name?.surname ?? "",
  });
  const paypalShipping = payPalAddressToCartAddress(
    unit?.shipping?.address,
    splitFullName(unit?.shipping?.name?.full_name),
  );

  const billingSource = isUsableAddress(args.cartBilling)
    ? args.cartBilling
    : (paypalBilling ??
      (isUsableAddress(args.cartShipping)
        ? args.cartShipping
        : paypalShipping));

  const shippingSource = isUsableAddress(args.cartShipping)
    ? args.cartShipping
    : (paypalShipping ?? billingSource);

  const billingEmail =
    nonEmpty(args.cartBilling?.email) ||
    nonEmpty(payer?.email_address) ||
    undefined;

  return {
    billingAddress: cartAddressToInput(billingSource, billingEmail),
    shippingAddress: cartAddressToInput(shippingSource),
    billingEmail,
  };
}
