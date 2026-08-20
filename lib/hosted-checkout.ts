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

/** A cart, as the hosted-checkout question needs it. */
export interface HostedCheckoutCart {
  checkoutUrl?: string | null;
}

function rawCheckoutUrl(
  cart: HostedCheckoutCart | null | undefined,
): string | null {
  const url = cart?.checkoutUrl?.trim();
  return url ? url : null;
}

/**
 * True when the provider — not HeadKit — owns this cart's checkout.
 *
 * The single definition of "this is a hosted-checkout cart", because two
 * unrelated behaviours hang off it: the CTA leaves the HeadKit origin, and the
 * provider's totals follow a different tax convention (`lib/cart-prices.ts`).
 * Two copies of the null-check would let those two answers drift apart.
 */
export function hasHostedCheckout(
  cart: HostedCheckoutCart | null | undefined,
): boolean {
  return rawCheckoutUrl(cart) !== null;
}

export function hostedCheckoutUrl(
  cart: HostedCheckoutCart | null | undefined,
): string | null {
  const url = rawCheckoutUrl(cart);
  return url === null ? null : withShopifyCheckoutChannel(url);
}

/** True when the CTA should leave the HeadKit origin (Shopify Checkout). */
export function isHostedCheckoutHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}
