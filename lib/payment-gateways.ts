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

/**
 * Human labels for the offline gateways WooCommerce ships in core.
 *
 * These are the FALLBACK, not the name the shopper should see: a merchant
 * re-titles a gateway in WooCommerce (a store may show `bacs` as
 * "Pay by bank", a local scheme name, or anything else), and that title is
 * resolved in `lib/offline-gateway-details.ts`. Exported so the
 * confirmation page can match a placed order's title against the same set.
 */
export const CORE_OFFLINE_LABELS: Readonly<Record<string, string>> = {
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

/** A cart, as the PayPal and offline-gateway questions need it. */
export interface GatewayEligibleCart {
  paymentMethods?: readonly string[] | null | undefined;
  /** Shopify (and any hosted-checkout provider) sets this; WooCommerce nulls it. */
  checkoutUrl?: string | null | undefined;
  totals?: { totalPrice?: string | null | undefined } | null | undefined;
}

/**
 * Whether the Payment step offers PayPal for this cart.
 *
 * FOUR conditions, and each one closes a different hole:
 *
 * 1. **`configured`** — this store carries both PayPal credentials
 *    (`lib/paypal/config.ts`). The server resolves it; the client is only told
 *    the answer. With it false NOTHING about the checkout changes, which is the
 *    property `app/checkout/paypal-absent.test.tsx` exists to hold.
 * 2. **The cart offers `headkit-payments`.** PayPal is not a separate
 *    WooCommerce gateway — it settles through the same one, so a store that has
 *    not enabled it has no gateway for the order to be placed against.
 * 3. **Not a hosted-checkout cart.** Shopify owns its own checkout end to end;
 *    there is no WooCommerce order for a PayPal capture to attach to.
 * 4. **Not a zero-total cart.** A $0 order has no payment step at all — the
 *    free-order confirm in `checkout-page-content.tsx` is the whole flow, and
 *    PayPal rejects a zero `amount.value`.
 *
 * `hasHostedCheckout` is deliberately NOT imported here: this module is the
 * gateway classifier and stays dependency-free, so the `checkoutUrl` null-check
 * is expressed the same way `lib/hosted-checkout.ts` defines it. The two are
 * asserted to agree in `payment-gateways.test.ts`.
 */
export function hasPayPalOption(
  cart: GatewayEligibleCart | null | undefined,
  configured: boolean,
): boolean {
  if (!configured || !cart) return false;
  if (!hasStripeGateway(cart.paymentMethods)) return false;
  if ((cart.checkoutUrl ?? "").trim() !== "") return false;
  // NOT `getFloatVal`: it strips the sign along with the currency symbol, so a
  // negative total reads as a positive one and PayPal gets offered for it.
  // Keep a LEADING minus; drop everything else that is not a digit or a point.
  const raw = (cart.totals?.totalPrice ?? "0").trim();
  const sign = raw.startsWith("-") ? -1 : 1;
  const total = sign * Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(total) && total > 0;
}

/**
 * Whether the Payment step offers an OFFLINE gateway
 * alongside Stripe — the mixed case a merchant-enabled `bacs` lives in.
 *
 * Distinct from {@link isOfflineOnlyCart} in one respect only, and it is the
 * whole reason both exist: that one is the cart with NO card capability, which
 * `checkout-page-content.tsx` answers with its own address-collecting form.
 * This one is a cart that can do both, where Contact / Delivery / Shipping
 * have already been walked through the Stripe-backed steps and the offline
 * gateway is one more row at the end of them.
 *
 * A hosted-checkout (Shopify) cart is refused for the same reason PayPal is:
 * there is no WooCommerce order for the finalize to produce. Expressed here as
 * the `checkoutUrl` null-check rather than by importing `lib/hosted-checkout.ts`,
 * so this module stays the dependency-free gateway classifier; the two are
 * asserted to agree in `payment-gateways.test.ts`.
 */
export function hasOfflineGatewayOption(
  cart: GatewayEligibleCart | null | undefined,
): boolean {
  if (!cart) return false;
  if (!hasStripeGateway(cart.paymentMethods)) return false;
  if ((cart.checkoutUrl ?? "").trim() !== "") return false;
  return offlineGateways(cart.paymentMethods).length > 0;
}
