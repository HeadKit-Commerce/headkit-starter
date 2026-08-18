/**
 * Shared out-of-stock checks for PDP / cards.
 *
 * Shopify can return availableForSale=true with quantityAvailable=0
 * (inventory policy CONTINUE). Commerce maps that to stockStatus=outofstock
 * when qty is present; this helper still treats qty 0 as OOS so the UI
 * stays correct if stockStatus is stale or missing.
 */

export interface VariationStockLike {
  stockStatus?: string | null;
  stockQuantity?: number | null;
}

export function isVariationOutOfStock(v: VariationStockLike): boolean {
  if ((v.stockStatus ?? "").toLowerCase() === "outofstock") {
    return true;
  }
  return v.stockQuantity === 0;
}

export function isSizeAttrSlug(slug: string): boolean {
  return slug === "pa_size" || slug === "size";
}
