/**
 * Shopify (and any future hosted-checkout provider) exposes cart.checkoutUrl.
 * WooCommerce leaves it null and continues through Stripe Checkout Sessions.
 *
 * Online Store password protection also gates Shopify Checkout unless the URL
 * identifies a non–Online-Store sales channel. Partner support recommends
 * `?channel=headless-storefronts` for Storefront API / headless carts
 * (see ENG-836 plan: keep *.myshopify.com passworded; checkout must still work).
 * Override with NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL when the merchant's
 * channel handle differs (Admin → Sales channels).
 */
const DEFAULT_SHOPIFY_CHECKOUT_CHANNEL = "headless-storefronts";

function shopifyCheckoutChannel(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL?.trim()
      : undefined;
  return fromEnv || DEFAULT_SHOPIFY_CHECKOUT_CHANNEL;
}

/**
 * Ensures a Shopify hosted checkout URL carries the sales-channel query so
 * password-protected Online Store does not intercept Checkout.
 */
export function withShopifyCheckoutChannel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!parsed.searchParams.has("channel")) {
    parsed.searchParams.set("channel", shopifyCheckoutChannel());
  }
  return parsed.toString();
}

export function hostedCheckoutUrl(
  cart: { checkoutUrl?: string | null } | null | undefined,
): string | null {
  const url = cart?.checkoutUrl?.trim();
  if (!url) {
    return null;
  }
  return withShopifyCheckoutChannel(url);
}

/** True when the CTA should leave the HeadKit origin (Shopify Checkout). */
export function isHostedCheckoutHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}
