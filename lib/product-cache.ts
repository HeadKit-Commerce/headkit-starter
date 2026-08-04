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
  // Finite `hours` backstop (was `days`): price/stock edits that miss the WP
  // webhook (secret misconfig, variation-only save) self-heal within ~1 hour
  // instead of sticking until the next day (threat T-09.5-12).
  cacheLife("hours");
  cacheTag(TAG.product(slug), TAG.products);
  return headkit.products.get(slug);
}
