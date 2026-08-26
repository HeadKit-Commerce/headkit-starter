import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";

export type ProductPageLoadOptions = {
  /** Shopify Admin preview_key — bypasses cache and loads draft products. */
  shopifyPreviewKey?: string | undefined;
};

/**
 * Shared PDP product read — ONE cache entry keyed by product slug, read by both
 * PDP routes, so a single `revalidateTag` invalidates every storefront PDP
 * (ENG-853).
 *
 * The redirect now runs the other way: since the 2026-08-22 canonical decision
 * the nested `/shop/{cat…}/{slug}` route is the winner and the flat `/products`
 * route 308s onto it. Sharing this entry is what keeps the two consistent while
 * both still serve — the flat route reads it to decide whether to redirect, and
 * the nested route reads it to render.
 */
export async function getCachedProduct(slug: string) {
  "use cache";
  // Finite `days` backstop (was `max`): a missed product webhook self-heals in
  // ~1 day (threat T-09.5-12) instead of sticking until redeploy.
  cacheLife("days");
  cacheTag(TAG.product(slug), TAG.products);
  return headkit.products.get(slug);
}

/**
 * Product read for PDP routes. Uses the shared cache for normal traffic; Shopify
 * Admin preview passes preview_key and must not cache draft/unpublished reads.
 */
export async function getProductForPage(
  slug: string,
  options?: ProductPageLoadOptions,
) {
  if (options?.shopifyPreviewKey) {
    return headkit
      .withShopifyPreviewKey(options.shopifyPreviewKey)
      .products.get(slug);
  }
  return getCachedProduct(slug);
}
