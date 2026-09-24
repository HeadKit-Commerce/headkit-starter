/**
 * The checkout context a PayPal order carries so the
 * WEBHOOK can finalise an order the browser did not.
 *
 * ---------------------------------------------------------------------------
 * Why anything is stored on PayPal's side at all
 * ---------------------------------------------------------------------------
 * A webhook arrives with no cookies. To finalise it needs exactly what the
 * browser path reads from the request: the WooCommerce cart token, and the
 * draft order's id + key. The card path solves the identical problem by
 * putting the cart token in the STRIPE SESSION's metadata and reading it back
 * in the webhook (`session.cartToken`, used on the success page today). This
 * is the same move against the same class of third party, so it is a precedent
 * being followed rather than a new exposure — but it IS third-party storage of
 * a session credential and it should be named as that, which is what this
 * docblock is for. Nothing here is ever sent to the browser: `createOrder`
 * returns only the PayPal order id, and reading a PayPal order back requires
 * our own OAuth credentials.
 *
 * ---------------------------------------------------------------------------
 * Which fields, and why two
 * ---------------------------------------------------------------------------
 * `custom_id` is the only context field PayPal copies onto the CAPTURE object,
 * so it is the one a `PAYMENT.CAPTURE.*` event carries without a second API
 * call — the order id and key go there. It is short.
 *
 * The cart token is a JWT and does not fit beside them, so it goes in
 * `reference_id`, which is the larger field and is readable via
 * `GET /v2/checkout/orders/{id}` — a call the webhook makes anyway, because it
 * needs the payer and shipping addresses from the same response.
 *
 * ---------------------------------------------------------------------------
 * Degradation is deliberate, and one-directional
 * ---------------------------------------------------------------------------
 * If the cart token does not fit, {@link encodePayPalContext} reports that
 * instead of truncating: a truncated token is a token that fails to
 * authenticate at the worst possible moment. The order is still created, the
 * browser path is completely unaffected, and only the webhook FALLBACK is
 * unavailable for that one order — logged by the caller as
 * `paypal_webhook_context_omitted`.
 */

/** PayPal's documented maximum lengths for the two fields used here. */
export const PAYPAL_CUSTOM_ID_MAX = 127;
export const PAYPAL_REFERENCE_ID_MAX = 256;

/** Marks a `custom_id` this storefront wrote, and versions its shape. */
const CUSTOM_ID_PREFIX = "hk1";
const FIELD_SEPARATOR = "|";

/** Written to `reference_id` when the cart token cannot be carried. */
export const NO_CART_REFERENCE = "hk-no-cart";

export interface PayPalCheckoutContext {
  /** WooCommerce draft order id, or null when WC deferred its creation. */
  orderId: string | null;
  /** WooCommerce order key, or null alongside a null orderId. */
  orderKey: string | null;
  /** The `hk-cart-token` JWT, or null when it did not fit. */
  cartToken: string | null;
}

export interface PayPalContextFields {
  customId: string;
  referenceId: string;
  /** True when the cart token had to be dropped — the caller logs this. */
  cartTokenOmitted: boolean;
}

/** True when a value can travel in `custom_id` without meaning being changed. */
function isCarryable(value: string): boolean {
  return !value.includes(FIELD_SEPARATOR);
}

export function encodePayPalContext(
  context: PayPalCheckoutContext,
): PayPalContextFields {
  // A separator inside a value would make decoding ambiguous. WooCommerce
  // order ids are numeric and order keys are `wc_order_<alnum>`, so this is a
  // guard against a future shape rather than a live case — but it must fail
  // to CARRY, never to mis-decode.
  const orderId =
    context.orderId && isCarryable(context.orderId) ? context.orderId : "";
  const orderKey =
    context.orderKey && isCarryable(context.orderKey) ? context.orderKey : "";

  const customId = [CUSTOM_ID_PREFIX, orderId, orderKey].join(FIELD_SEPARATOR);

  const token = context.cartToken ?? "";
  const tokenFits = token.length > 0 && token.length <= PAYPAL_REFERENCE_ID_MAX;

  return {
    // Over-long is not truncated — it is dropped back to the bare marker, so a
    // decode returns "no draft order" rather than a corrupted id.
    customId:
      customId.length <= PAYPAL_CUSTOM_ID_MAX
        ? customId
        : [CUSTOM_ID_PREFIX, "", ""].join(FIELD_SEPARATOR),
    referenceId: tokenFits ? token : NO_CART_REFERENCE,
    cartTokenOmitted: !tokenFits,
  };
}

/**
 * Read back what {@link encodePayPalContext} wrote. Returns null when the
 * fields were not written by this storefront — a PayPal order created by
 * anything else must not be mistaken for one of ours.
 */
export function decodePayPalContext(fields: {
  customId?: string | null | undefined;
  referenceId?: string | null | undefined;
}): PayPalCheckoutContext | null {
  const customId = fields.customId ?? "";
  const parts = customId.split(FIELD_SEPARATOR);
  if (parts[0] !== CUSTOM_ID_PREFIX) return null;

  const referenceId = fields.referenceId ?? "";
  return {
    orderId: parts[1] ? parts[1] : null,
    orderKey: parts[2] ? parts[2] : null,
    cartToken:
      referenceId && referenceId !== NO_CART_REFERENCE ? referenceId : null,
  };
}
