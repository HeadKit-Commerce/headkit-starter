import { cacheLife, cacheTag } from "next/cache";
import type { BrandSummary, ProductListFilter } from "@headkit/sdk";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import { normalizeFilterKey } from "@/components/headkit-ui/collection/utils";

export type CatalogScope =
  | { kind: "shop" }
  | { kind: "category"; slug: string }
  | { kind: "brand"; slug: string }
  | { kind: "route"; route: "sale" | "new" };

/**
 * Durable remote catalog page — shared by PLP RSC pages and Server Actions so
 * load-more / filter refresh hits the same cache as the initial grid (ENG-853).
 */
export async function getCachedCatalogPage(
  filter: ProductListFilter | undefined,
  page: number,
  perPage: number,
  scope: CatalogScope,
) {
  "use cache: remote";
  cacheLife("minutes");

  const filterKey = normalizeFilterKey(filter ?? {});
  switch (scope.kind) {
    case "shop":
      cacheTag(TAG.route("shop"), TAG.products, `catalog:${filterKey}`);
      break;
    case "category":
      cacheTag(
        TAG.catalogCat(scope.slug),
        TAG.products,
        `catalog:${filterKey}`,
      );
      break;
    case "brand":
      cacheTag(TAG.brand(scope.slug), TAG.products, `catalog:${filterKey}`);
      break;
    case "route":
      cacheTag(TAG.route(scope.route), TAG.products, `catalog:${filterKey}`);
      break;
  }

  return headkit.collections.list(filter, page, perPage);
}

/** Shared brand facet list for PLP filter drawers. */
export async function getCachedFilterBrands(): Promise<BrandSummary[]> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(TAG.brands, "catalog:filters");
  const result = await headkit.brands.list({
    perPage: 100,
    orderby: "name",
    order: "asc",
  });
  return result.brands;
}

/** Infer catalog scope from a list filter (used by Server Actions). */
export function scopeFromFilter(
  filter: ProductListFilter | undefined,
): CatalogScope {
  // ProductListFilter uses singular brand/category (UI may multi-select but
  // buildProductListFilter maps only the first value — see utils.ts).
  if (filter?.brand) {
    return { kind: "brand", slug: filter.brand };
  }
  if (filter?.category) {
    return { kind: "category", slug: filter.category };
  }
  if (filter?.onSale) {
    return { kind: "route", route: "sale" };
  }
  if (filter?.isNew) {
    return { kind: "route", route: "new" };
  }
  return { kind: "shop" };
}
