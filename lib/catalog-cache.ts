import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import type { BrandSummary, ProductListFilter } from "@headkit/sdk";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import { normalizeFilterKey } from "@/components/headkit-ui/collection/utils";

/**
 * Comma-free, order-independent cache tag for a normalized filter key.
 *
 * `normalizeFilterKey` returns `JSON.stringify` output, and Next splits
 * `cacheTag()` values on commas when it serializes them into the
 * `x-next-cache-tags` header — so `catalog:{"a":1,"b":2}` arrived at the CDN as
 * several bogus fragments instead of one tag, and the entry was keyed by none
 * of them.
 *
 * Hashed rather than joined as sorted `k=v` pairs: `attributes` is an unbounded
 * array (one entry per selected facet group/value), so a joined string has no
 * fixed upper bound and can exceed Next's 256-char tag limit
 * (`NEXT_CACHE_TAG_MAX_LENGTH`) on a heavily-faceted filter; a hash is
 * fixed-length regardless of filter shape. `normalizeFilterKey` already sorts
 * object keys, so hashing its output is automatically order-independent.
 *
 * Opaqueness in logs and headers is an accepted trade: this tag is never fired
 * by name — only `TAG.*` contract tags pass `isKnownTag` and reach a purge (see
 * `lib/cache-tags.ts`) — so the readability of the string itself has no
 * operational value.
 */
export function catalogFilterTag(filterKey: string): string {
  const hash = createHash("sha256")
    .update(filterKey)
    .digest("hex")
    .slice(0, 16);
  return `catalog:${hash}`;
}

export type CatalogScope =
  | { kind: "shop" }
  | { kind: "category"; slug: string }
  | { kind: "brand"; slug: string }
  | { kind: "route"; route: "sale" | "new" | "featured" };

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
  cacheLife("hours");

  const filterKey = normalizeFilterKey(filter ?? {});
  const filterTag = catalogFilterTag(filterKey);
  switch (scope.kind) {
    case "shop":
      cacheTag(TAG.route("shop"), TAG.products, TAG.catalog, filterTag);
      break;
    case "category":
      cacheTag(
        TAG.catalogCat(scope.slug),
        TAG.products,
        TAG.catalog,
        filterTag,
      );
      break;
    case "brand":
      cacheTag(TAG.brand(scope.slug), TAG.products, TAG.catalog, filterTag);
      break;
    case "route":
      cacheTag(TAG.route(scope.route), TAG.products, TAG.catalog, filterTag);
      break;
  }

  return headkit.collections.list(filter, page, perPage);
}

/** Shared brand facet list for PLP filter drawers. */
export async function getCachedFilterBrands(): Promise<BrandSummary[]> {
  "use cache: remote";
  cacheLife("hours");
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
  if (filter?.featured) {
    return { kind: "route", route: "featured" };
  }
  return { kind: "shop" };
}
