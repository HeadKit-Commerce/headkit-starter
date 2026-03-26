import type { ProductListFilter, ProductCategoryDetail } from "@headkit/sdk";

export const SortKey = {
  FEATURED: "FEATURED",
  BEST_SELLING: "BEST_SELLING",
  CREATED_AT: "CREATED_AT",
  CREATED_AT_DESC: "CREATED_AT_DESC",
  PRICE: "PRICE",
  PRICE_DESC: "PRICE_DESC",
  TITLE: "TITLE",
  TITLE_DESC: "TITLE_DESC",
} as const;

export type SortKeyType = keyof typeof SortKey;

export const SortKeyLabels: Record<SortKeyType, string> = {
  FEATURED: "Featured",
  BEST_SELLING: "Best selling",
  CREATED_AT: "Date, new to old",
  CREATED_AT_DESC: "Date, old to new",
  PRICE: "Price, low to high",
  PRICE_DESC: "Price, high to low",
  TITLE: "Alphabetically, A-Z",
  TITLE_DESC: "Alphabetically, Z-A",
};

export interface FilterValues {
  categories: string[];
  brands: string[];
  attributes: Record<string, string[]>;
  instock: boolean;
  sort: SortKeyType | "";
  page: number;
}

export const DEFAULT_FILTER_VALUES: FilterValues = {
  categories: [],
  brands: [],
  attributes: {},
  instock: false,
  sort: "",
  page: 1,
};

/** Convert slug-like option value to display name (e.g. "some-option" -> "Some Option"). */
export function formatOptionName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function buildProductListFilter(
  filterValues: FilterValues,
  options: {
    categorySlug?: string;
    onSale?: boolean;
    isNew?: boolean;
    search?: string;
    brandSlug?: string;
  } = {},
): ProductListFilter {
  const filter: ProductListFilter = {};

  const categoryValue = options.categorySlug ?? filterValues.categories[0];
  if (categoryValue) filter.category = categoryValue;

  const brandValue = options.brandSlug ?? filterValues.brands[0];
  if (brandValue) filter.brand = brandValue;

  if (Object.keys(filterValues.attributes).length) {
    filter.attributes = Object.entries(filterValues.attributes)
      .filter(([, v]) => v.length > 0)
      .flatMap(([slug, values]) => values.map((value) => ({ slug, value })));
  }

  if (options.onSale) filter.onSale = true;
  if (options.isNew) filter.isNew = true;
  if (options.search) filter.search = options.search;

  const sortMap: Record<SortKeyType, { orderby: string; order: string }> = {
    FEATURED: { orderby: "menu_order", order: "asc" },
    BEST_SELLING: { orderby: "popularity", order: "desc" },
    CREATED_AT: { orderby: "date", order: "desc" },
    CREATED_AT_DESC: { orderby: "date", order: "asc" },
    PRICE: { orderby: "price", order: "asc" },
    PRICE_DESC: { orderby: "price", order: "desc" },
    TITLE: { orderby: "title", order: "asc" },
    TITLE_DESC: { orderby: "title", order: "desc" },
  };

  if (filterValues.sort) {
    const s = sortMap[filterValues.sort];
    filter.orderby = s.orderby;
    filter.order = s.order;
  }

  return filter;
}

/**
 * Encode attribute filter values into a path-safe slug.
 * Format: `{attrName}.{val1}.{val2}_{attrName2}.{val1}` — dots join names+values within a
 * group, underscores separate groups. Attributes and values are sorted for determinism.
 * Returns an empty string when no attributes are selected.
 */
export function encodeFilterSlug(filters: FilterValues): string {
  const parts: string[] = [];
  const sortedAttrs = Object.entries(filters.attributes)
    .filter(([, vals]) => vals.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [slug, vals] of sortedAttrs) {
    const attrName = slug.replace(/^pa_/, "");
    parts.push(`${attrName}.${[...vals].sort().join(".")}`);
  }
  return parts.join("_");
}

/**
 * Decode a filter slug produced by {@link encodeFilterSlug} back into attribute key→values map.
 * Restores `pa_` prefix on attribute names. Returns an empty object for an empty slug.
 */
export function decodeFilterSlug(slug: string): Record<string, string[]> {
  if (!slug) return {};
  const attributes: Record<string, string[]> = {};
  for (const group of slug.split("_")) {
    const dotIdx = group.indexOf(".");
    if (dotIdx === -1) continue;
    const attrName = group.slice(0, dotIdx);
    const values = group.slice(dotIdx + 1).split(".");
    if (attrName && values.length > 0) {
      attributes[`pa_${attrName}`] = values;
    }
  }
  return attributes;
}

/** Build breadcrumb URIs to match the Next.js route /collections/[...slug] (same as URL path). */
export function buildBreadcrumbFromCategory(
  category: ProductCategoryDetail,
): { name: string; uri: string; current: boolean }[] {
  const crumbs: { name: string; uri: string; current: boolean }[] = [
    { name: "Home", uri: "/", current: false },
    { name: "Shop", uri: "/shop", current: false },
  ];

  const ancestors = [...(category.ancestors ?? [])].reverse();
  const pathSegments: string[] = [];

  for (const ancestor of ancestors) {
    pathSegments.push(ancestor.slug);
    crumbs.push({
      name: ancestor.name,
      uri: `/collections/${pathSegments.join("/")}`,
      current: false,
    });
  }

  pathSegments.push(category.slug);
  crumbs.push({
    name: category.name,
    uri: `/collections/${pathSegments.join("/")}`,
    current: true,
  });

  return crumbs;
}
