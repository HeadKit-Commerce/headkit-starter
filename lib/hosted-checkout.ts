/**
 * Shopify (and any future hosted-checkout provider) exposes cart.checkoutUrl.
 * WooCommerce leaves it null and continues through Stripe Checkout Sessions.
 *
 * Online Store password protection also gates Shopify Checkout unless the URL
 * identifies a non–Online-Store sales channel. Partner support recommends
 * `?channel=headless-storefronts` for Storefront API / headless carts
 * (see ENG-836 plan). Override with NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL when
 * the merchant's channel handle differs (Admin → Sales channels).
 *
 * Optional NEXT_PUBLIC_SHOPIFY_CHECKOUT_DOMAIN rewrites the checkout URL host
 * to a custom subdomain (e.g. checkout.brand.com) configured in HeadKit
 * Dashboard → Checkout. Empty / unset keeps the Storefront API host
 * (usually *.myshopify.com).
 */
const DEFAULT_SHOPIFY_CHECKOUT_CHANNEL = "headless-storefronts";

function shopifyCheckoutChannel(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL?.trim()
      : undefined;
  return fromEnv || DEFAULT_SHOPIFY_CHECKOUT_CHANNEL;
}

function shopifyCheckoutDomain(): string | undefined {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_DOMAIN?.trim()
      : undefined;
  return fromEnv || undefined;
}

/**
 * Ensures a Shopify hosted checkout URL uses the configured checkout host
 * (optional) and carries the sales-channel query so password-protected Online
 * Store does not intercept Checkout.
 */
export function withShopifyCheckoutChannel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const domain = shopifyCheckoutDomain();
  if (domain) {
    parsed.hostname = domain;
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
