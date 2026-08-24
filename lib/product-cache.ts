import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";

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
