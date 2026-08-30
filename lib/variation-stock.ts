/**
 * Shared out-of-stock checks for PDP / cards.
 *
 * Shopify CONTINUE (sell when out of stock) maps to stockStatus=onbackorder
 * with quantityAvailable=0 — same as WooCommerce backorder. That status must
 * stay purchasable. Quantity 0 alone only means OOS when status is missing or
 * explicitly outofstock (guards stale/partial payloads).
 */

export interface VariationStockLike {
  // `| undefined` is required under exactOptionalPropertyTypes when callers
  // pass through optional props (e.g. AvailabilityStatus) as object literals.
  stockStatus?: string | null | undefined;
  stockQuantity?: number | null | undefined;
}

export function isVariationOutOfStock(v: VariationStockLike): boolean {
  const status = (v.stockStatus ?? "").toLowerCase();
  if (status === "outofstock") {
    return true;
  }
  // Explicitly sellable — ignore a zero quantity (CONTINUE / backorder).
  if (status === "instock" || status === "onbackorder") {
    return false;
  }
  return v.stockQuantity === 0;
}

/** True when inventory may go to / stay at zero but purchase is still allowed. */
export function isBackorderStockStatus(
  stockStatus: string | null | undefined,
): boolean {
  return (stockStatus ?? "").toLowerCase() === "onbackorder";
}

export function isSizeAttrSlug(slug: string): boolean {
  return slug === "pa_size" || slug === "size";
}
