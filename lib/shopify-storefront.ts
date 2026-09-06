/**
 * Shopify storefront signals. Kept free of `lib/env` so helpers stay
 * unit-testable without booting the Zod env schema.
 */

export type ShopifyStorefrontEnv = {
  NEXT_PUBLIC_SHOPIFY_CAA_ENABLED?: string | undefined;
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN?: string | undefined;
  SHOPIFY_STORE_DOMAIN?: string | undefined;
  NEXT_PUBLIC_WHOLESALE_FORM_ID?: string | undefined;
};

/**
 * True when this storefront is a Shopify tenant.
 *
 * CAA is the usual dashboard-provisioned signal. Store domain (public or
 * server) covers a Shopify shop that has not flipped CAA yet.
 */
export function detectShopifyStorefront(input: {
  caaEnabled?: string | undefined;
  publicStoreDomain?: string | undefined;
  storeDomain?: string | undefined;
}): boolean {
  return (
    input.caaEnabled === "true" ||
    Boolean(input.publicStoreDomain) ||
    Boolean(input.storeDomain)
  );
}

/** Runtime Shopify detection from validated env. */
export function isShopifyStorefront(env: ShopifyStorefrontEnv): boolean {
  return detectShopifyStorefront({
    caaEnabled: env.NEXT_PUBLIC_SHOPIFY_CAA_ENABLED,
    publicStoreDomain: env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN,
    storeDomain: env.SHOPIFY_STORE_DOMAIN,
  });
}

/**
 * Gravity Forms id mounted on /wholesale.
 *
 * Woo stores keep the existing contract: unset env → no form. Shopify has no
 * Gravity Forms, so the built-in Online Store contact form (id 1) is the
 * Hydrogen-equivalent default.
 */
export function resolveWholesaleFormId(
  configured: string | undefined,
  shopify: boolean,
): string | undefined {
  if (configured) return configured;
  if (shopify) return "1";
  return undefined;
}

/** Runtime wholesale form id from validated env. */
export function wholesaleFormId(env: ShopifyStorefrontEnv): string | undefined {
  return resolveWholesaleFormId(
    env.NEXT_PUBLIC_WHOLESALE_FORM_ID,
    isShopifyStorefront(env),
  );
}
