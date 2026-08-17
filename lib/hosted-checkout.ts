/**
 * Shopify (and any future hosted-checkout provider) exposes cart.checkoutUrl.
 * WooCommerce leaves it null and continues through Stripe Checkout Sessions.
 */
export function hostedCheckoutUrl(
  cart: { checkoutUrl?: string | null } | null | undefined,
): string | null {
  const url = cart?.checkoutUrl?.trim();
  if (!url) {
    return null;
  }
  return url;
}
