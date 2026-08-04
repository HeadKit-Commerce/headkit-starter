import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";

/**
 * Shared PDP product read — single cache entry for the canonical `/products`
 * route. Shop PDP permanently redirects here so one `revalidateTag` invalidates
 * all storefront PDPs (ENG-853).
 */
export async function getCachedProduct(slug: string) {
  "use cache";
  // Finite `days` backstop (was `max`): a missed product webhook self-heals in
  // ~1 day (threat T-09.5-12) instead of sticking until redeploy.
  cacheLife("days");
  cacheTag(TAG.product(slug), TAG.products);
  return headkit.products.get(slug);
}
