"use server";

import { getCachedProduct } from "@/lib/product-cache";
import { productPath } from "@/lib/canonical-path";

/**
 * Resolves a cart line item's canonical storefront path from its product
 * slug (G23). The cart fragment carries only `slug` — no permalink — so
 * `components/headkit-ui/cart-item.tsx` and
 * `components/quote/quote-cart-items.tsx` cannot build `productPath` from the
 * line item alone and fall back to the flat `/products/{slug}` guess, which
 * 308s to the nested canonical on a store whose permalink base carries a
 * category. This looks the product up through the same per-slug cache the
 * PDP routes read (`getCachedProduct`), so no SDK/schema change is needed to
 * get the real canonical: `uri` is already selected on `ProductFields`.
 *
 * Returns null on a miss or a provider error — callers keep the flat guess as
 * their fallback, so a resolution failure degrades to today's behavior rather
 * than breaking the link.
 */
export async function resolveCartItemPath(
  slug: string,
): Promise<string | null> {
  try {
    const product = await getCachedProduct(slug);
    return product ? productPath(product) : null;
  } catch {
    return null;
  }
}
