/**
 * Shopify storefront signals. Kept free of `lib/env` so helpers stay
 * unit-testable without booting the Zod env schema.
 */

export type ShopifyStorefrontEnv = {
  NEXT_PUBLIC_SHOPIFY_CAA_ENABLED?: string | undefined;
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN?: string | undefined;
  SHOPIFY_STORE_DOMAIN?: string | undefined;
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

const PARTNERSHIP_SLUGS = new Set(["partnerships", "partnership"]);

/**
 * Catch-all CMS slugs that are a Shopify enquiry page (no dedicated route).
 * Woo pages must not use this — they keep Gravity Forms shortcodes.
 */
export function isShopifyPartnershipsSlug(slug: string): boolean {
  const parts = slug.split("/").filter(Boolean);
  const last = (parts[parts.length - 1] ?? slug).toLowerCase();
  return PARTNERSHIP_SLUGS.has(last);
}
