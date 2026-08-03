"use server";

import type {
  BrandSummary,
  ProductListFilter,
  ProductSummaryFieldsFragment,
} from "@headkit/sdk";
import {
  getCachedCatalogPage,
  getCachedFilterBrands,
  scopeFromFilter,
} from "@/lib/catalog-cache";

export type CollectionPageResult = {
  products: ProductSummaryFieldsFragment[];
  total: number;
  totalPages: number;
  page: number;
};

/**
 * Same-origin catalog page fetch for PLP infinite scroll / filter refresh.
 *
 * Must run on the server: browser → GraphQL is blocked when the gateway CORS
 * allowlist does not include the tenant storefront origin. Server Actions avoid
 * that entirely. Catalog reads go through the shared remote cache so load-more
 * is not a permanent cache miss (ENG-853).
 */
export async function listCollectionProducts(
  filter: ProductListFilter | undefined,
  page: number,
  perPage: number,
): Promise<CollectionPageResult> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage =
    Number.isFinite(perPage) && perPage > 0
      ? Math.min(Math.floor(perPage), 100)
      : 24;

  const result = await getCachedCatalogPage(
    filter,
    safePage,
    safePerPage,
    scopeFromFilter(filter),
  );

  return {
    products: result.products as ProductSummaryFieldsFragment[],
    total: result.total,
    totalPages: result.totalPages,
    page: result.page,
  };
}

/** Brand facet options for the PLP filter drawer (same-origin, no CORS). */
export async function listFilterBrands(): Promise<BrandSummary[]> {
  return getCachedFilterBrands();
}
