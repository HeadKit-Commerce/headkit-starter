/**
 * Which payment gateways a cart offers, split by how the storefront drives them.
 *
 * WooCommerce reports the gateways AVAILABLE for a cart on the Store API cart
 * response; commerce surfaces that list as `Cart.paymentMethods`. Two ids are
 * special to HeadKit and are never offline gateways:
 *
 *   headkit-payments  Stripe. Driven by the Checkout Session / Elements flow.
 *   headkit-quote     Quote mode. Has its own `/quote` route and store setting,
 *                     so it must not appear as a payment choice on `/checkout`.
 *
 * Everything else — bacs, cheque, cod, and any other offline gateway a merchant
 * enables — is placed by finalizing the WooCommerce order with no payment
 * session, which is exactly what `processCheckoutAction` already does.
 */

export const STRIPE_PAYMENT_METHOD = "headkit-payments";
export const QUOTE_PAYMENT_METHOD_ID = "headkit-quote";

/** Gateway ids the storefront drives through a payment provider, not by finalizing. */
const NON_OFFLINE_METHODS: ReadonlySet<string> = new Set([
  STRIPE_PAYMENT_METHOD,
  QUOTE_PAYMENT_METHOD_ID,
]);

/** Human labels for the offline gateways WooCommerce ships in core. */
const CORE_OFFLINE_LABELS: Readonly<Record<string, string>> = {
  bacs: "Direct bank transfer",
  cheque: "Cheque payment",
  cod: "Cash on delivery",
};

export type PaymentGatewayChoice = {
  id: string;
  label: string;
};

/**
 * Offline gateways available for this cart, in the order WooCommerce returned
 * them (merchants control gateway order, so do not re-sort).
 */
export function offlineGateways(
  paymentMethods: readonly string[] | null | undefined,
): PaymentGatewayChoice[] {
  return (paymentMethods ?? [])
    .filter((id) => id && !NON_OFFLINE_METHODS.has(id))
    .map((id) => ({ id, label: CORE_OFFLINE_LABELS[id] ?? id }));
}

/** Whether Stripe is among the gateways this cart can use. */
export function hasStripeGateway(
  paymentMethods: readonly string[] | null | undefined,
): boolean {
  return (paymentMethods ?? []).includes(STRIPE_PAYMENT_METHOD);
}

/**
 * Whether this cart checks out entirely outside the storefront: it offers at
 * least one offline gateway and no Stripe.
 *
 * Two places must agree on this. `app/checkout/page.tsx` uses it to skip
 * creating a Stripe Checkout Session server-side — a store with no card
 * capability throws there, and the failure redirects to /checkout/error before
 * any component renders. `checkout-page-content.tsx` uses it to render the
 * offline form. Split definitions would let the page redirect away from the
 * very branch it was supposed to reach, so keep exactly one.
 */
export function isOfflineOnlyCart(
  paymentMethods: readonly string[] | null | undefined,
): boolean {
  return (
    offlineGateways(paymentMethods).length > 0 &&
    !hasStripeGateway(paymentMethods)
  );
}
