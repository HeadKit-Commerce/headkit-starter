"use server";

import type {
  BrandSummary,
  ProductListFilter,
  ProductListResult,
  ProductSummaryFieldsFragment,
} from "@headkit/sdk";
import { headkit } from "@/lib/sdk";

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
 * allowlist does not include the tenant storefront origin (staging currently
 * defaults to localhost only). Server Actions avoid that entirely.
 */
export async function listCollectionProducts(
  filter: ProductListFilter | undefined,
  page: number,
  perPage: number,
): Promise<CollectionPageResult> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage =
    Number.isFinite(perPage) && perPage > 0 ? Math.min(Math.floor(perPage), 100) : 24;

  const result: ProductListResult = await headkit.collections.list(
    filter,
    safePage,
    safePerPage,
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
  const result = await headkit.brands.list({
    perPage: 100,
    orderby: "name",
    order: "asc",
  });
  return result.brands;
}
