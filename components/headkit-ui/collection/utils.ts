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
  /** Price lower bound (string for SDK compat); empty/undefined = unset. */
  price_min?: string;
  /** Price upper bound (string for SDK compat); empty/undefined = unset. */
  price_max?: string;
}

export const DEFAULT_FILTER_VALUES: FilterValues = {
  categories: [],
  brands: [],
  attributes: {},
  instock: false,
  sort: "",
  page: 1,
  price_min: "",
  price_max: "",
};

/** Convert slug-like option value to display name (e.g. "some-option" -> "Some Option"). */
export function formatOptionName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Coerce a price-like string into a non-negative numeric string, or undefined. */
function coercePrice(value?: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return String(n);
}

export function buildProductListFilter(
  filterValues: FilterValues,
  options: {
    categorySlug?: string;
    onSale?: boolean;
    isNew?: boolean;
    search?: string;
    brandSlug?: string;
    /** In-stock toggle (mapped onto the filter for server-side filtering). */
    instock?: boolean;
    /** Price lower bound; coerced to a numeric string before mapping. */
    minPrice?: string;
    /** Price upper bound; coerced to a numeric string before mapping. */
    maxPrice?: string;
  } = {},
): ProductListFilter {
  const filter: ProductListFilter = {};

  const categoryValue = options.categorySlug ?? filterValues.categories[0];
  if (categoryValue) filter.category = categoryValue;

  // ⚠ Open Q1 = single-ok: ProductListFilter.brand is a single String. The UI
  // and URL carry a multi-select brands[] (D-02), but only the FIRST selected
  // brand maps to the backend filter (parity: old store was single-brand).
  const brandValue = options.brandSlug ?? filterValues.brands[0];
  if (brandValue) filter.brand = brandValue;

  if (Object.keys(filterValues.attributes).length) {
    filter.attributes = Object.entries(filterValues.attributes)
      .filter(([, v]) => v.length > 0)
      .flatMap(([slug, values]) => values.map((value) => ({ slug, value })));
  }

  const minPrice = coercePrice(options.minPrice ?? filterValues.price_min);
  if (minPrice !== undefined) filter.minPrice = minPrice;
  const maxPrice = coercePrice(options.maxPrice ?? filterValues.price_max);
  if (maxPrice !== undefined) filter.maxPrice = maxPrice;

  if (options.onSale) filter.onSale = true;
  if (options.isNew) filter.isNew = true;
  if (options.search) filter.search = options.search;
  // NOTE: in-stock has no ProductListFilter field in the commerce schema; it
  // remains a client-side grid filter (existing behavior). `options.instock`
  // is accepted for call-site symmetry but intentionally not mapped here.

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
 * Parse raw searchParams into FilterValues, reading ONLY known facet keys
 * (unknown URL params are ignored — no passthrough; T-03-P1). Attribute keys
 * (e.g. `pa_colour`) are namespaced and parsed separately by the client
 * context against the available ProductFilters; the server-side initial render
 * here covers the canonical first-class facets.
 */
export function parseSearchParams(sp: Record<string, string>): FilterValues {
  const split = (v?: string) => v?.split(",").filter(Boolean) ?? [];
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const sort = (sp.sort ?? "") as SortKeyType | "";
  return {
    ...DEFAULT_FILTER_VALUES,
    categories: split(sp.categories),
    brands: split(sp.brands),
    attributes: {},
    instock: sp.instock === "true",
    sort: sort in SortKey ? sort : "",
    page,
    price_min: coercePrice(sp.price_min) ?? "",
    price_max: coercePrice(sp.price_max) ?? "",
  };
}

/**
 * Produce a STABLE cache key from a built ProductListFilter (sorted keys, no
 * volatile fields). Used to key the durable catalog cache so equal filters
 * share a cache entry and the key space stays bounded (T-03-P2). Never derive
 * this from raw searchParams.
 */
export function normalizeFilterKey(filter: ProductListFilter): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(filter).sort()) {
    const value = (filter as Record<string, unknown>)[key];
    if (key === "attributes" && Array.isArray(value)) {
      sorted[key] = [...value]
        .map((a) => ({ slug: a.slug, value: a.value }))
        .sort((x, y) =>
          `${x.slug}:${x.value}`.localeCompare(`${y.slug}:${y.value}`),
        );
    } else {
      sorted[key] = value;
    }
  }
  return JSON.stringify(sorted);
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
