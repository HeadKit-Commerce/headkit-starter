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

/**
 * Attribute slugs treated as the indexable "color" facet (Tier-1).
 *
 * The URL/filter convention is `pa_color`/`pa_colour` (decodeFilterSlug re-adds
 * the `pa_` prefix; the backend ProductListFilter expects `pa_color`). But the
 * SDK's getFilters() returns DISPLAY attribute slugs with the prefix STRIPPED
 * (`color`/`colour`). Both forms must be recognised so the predicate works on
 * decoded filter values AND raw filter-option slugs.
 */
const COLOR_ATTR_SLUGS = ["pa_color", "pa_colour", "color", "colour"] as const;

/** True if an attribute slug is the color facet, in either pa_/stripped form. */
export function isColorAttrSlug(slug: string): boolean {
  return COLOR_ATTR_SLUGS.includes(slug as (typeof COLOR_ATTR_SLUGS)[number]);
}

/**
 * Tier-1 SEO predicate. Returns true ONLY for a "Nike-style" single-color
 * collection URL: exactly one attribute, that attribute is the color facet
 * (`pa_color`/`pa_colour`), it carries exactly one value, AND no other filter
 * is engaged (no brand, category, price, in-stock, non-default sort/page).
 *
 * This is the single source of truth gating index-vs-canonical-to-base. It runs
 * at request time too, so on-demand single-color pages are also SEO-correct.
 */
export function isIndexableFacet(filters: FilterValues): boolean {
  // No non-facet filter may be engaged. Brand is now an indexable facet (06.1)
  // so it is NOT rejected up-front — it is one of the two allowed dimensions.
  if (filters.categories.length > 0) return false;
  if (filters.instock) return false;
  if (filters.price_min) return false;
  if (filters.price_max) return false;
  if (filters.sort && filters.sort !== DEFAULT_FILTER_VALUES.sort) return false;
  if (filters.page && filters.page !== DEFAULT_FILTER_VALUES.page) return false;

  // Active attribute groups (ignore stray empty-array keys) and brand values.
  const activeAttrs = Object.entries(filters.attributes).filter(
    ([, vals]) => vals.length > 0,
  );
  const hasBrand = filters.brands.length > 0;

  // Indexable iff EXACTLY ONE facet dimension is engaged:
  //   (a) one color attribute with one value, AND no brand, OR
  //   (b) one brand with one value, AND no attribute.
  if (hasBrand) {
    // Brand path: no attribute groups may be engaged, single brand value only.
    if (activeAttrs.length > 0) return false;
    return filters.brands.length === 1;
  }

  // Color path: exactly one attribute group, the color facet, single value.
  if (activeAttrs.length !== 1) return false;
  const [slug, values] = activeAttrs[0]!;
  if (!COLOR_ATTR_SLUGS.includes(slug as (typeof COLOR_ATTR_SLUGS)[number]))
    return false;
  if (values.length !== 1) return false;

  return true;
}

/**
 * Tier-1 SEO title: "{FacetLabel} {categoryName}" — works for a color label
 * (e.g. "Red Lifestyle Shoes") OR a brand label (e.g. "Velocity Apparel").
 */
export function facetTitle(categoryName: string, facetLabel: string): string {
  return `${facetLabel} ${categoryName}`.trim();
}

/**
 * Tier-1 SEO description: a templated sentence for a single-facet collection.
 * `facetLabel` is a color or a brand label. Pass the real dashboard store name
 * when available — never hardcode a placeholder like `"Store"`.
 */
export function facetDescription(
  categoryName: string,
  facetLabel: string,
  storeName?: string | null,
): string {
  const site = (storeName ?? "").trim();
  const atSite = site.length > 0 ? ` at ${site}` : "";
  return `Shop ${facetLabel} ${categoryName}${atSite}. Browse the latest ${facetLabel.toLowerCase()} ${categoryName.toLowerCase()} with prices and availability.`;
}

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
 * Reserved facet-name token for the brand group in the path slug. Attribute
 * groups are keyed by their stripped attribute name (e.g. `color`); the brand
 * group is keyed by this literal. `brand` is the taxonomy `product_brand`,
 * never a WC product attribute, so there is no collision with attribute names.
 */
const BRAND_GROUP_KEY = "brand";

/**
 * Escape introducer for delimiter-safe value encoding. The readable scheme uses
 * `.` to join values within a facet group and `_` to separate facet groups; a
 * value that itself contains `.`, `_`, or the introducer `~` would corrupt the
 * round-trip. We escape those three characters as `~XX` (two lowercase hex
 * digits of the char code). The introducer is escaped FIRST so the transform is
 * reversible. All three are URL-path-safe both raw and escaped.
 */
const ESC = "~";

/** Escape a single filter value so it round-trips through the readable slug scheme. */
function escapeValue(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === ESC || ch === "." || ch === "_") {
      out += ESC + ch.charCodeAt(0).toString(16).padStart(2, "0");
    } else {
      out += ch;
    }
  }
  return out;
}

/** Reverse {@link escapeValue}: turn `~XX` sequences back into their characters. */
function unescapeValue(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === ESC && i + 2 < value.length) {
      const hex = value.slice(i + 1, i + 3);
      const code = parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        out += String.fromCharCode(code);
        i += 2;
        continue;
      }
    }
    out += value[i];
  }
  return out;
}

/**
 * Encode attribute + brand filter values into a path-safe slug.
 * Format: `{group}.{val1}.{val2}_{group2}.{val1}` — dots join names+values within
 * a group, underscores separate groups. Groups are: attribute names (stripped of
 * `pa_`, e.g. `color`) and the reserved `brand` group. Groups and values are
 * sorted for determinism. Every value is delimiter-safe escaped (see
 * {@link escapeValue}). Returns an empty string when nothing is selected.
 */
export function encodeFilterSlug(filters: FilterValues): string {
  const groups: { key: string; values: string[] }[] = [];

  for (const [slug, vals] of Object.entries(filters.attributes)) {
    if (vals.length === 0) continue;
    groups.push({ key: slug.replace(/^pa_/, ""), values: vals });
  }
  if (filters.brands.length > 0) {
    groups.push({ key: BRAND_GROUP_KEY, values: filters.brands });
  }

  return groups
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(
      ({ key, values }) =>
        `${key}.${[...values].sort().map(escapeValue).join(".")}`,
    )
    .join("_");
}

/**
 * Decoded filter slug: attribute key→values map (with `pa_` prefix restored)
 * plus the brand values. Replaces the prior flat `Record<string, string[]>`
 * shape so brand round-trips out of the path (06.1).
 */
export interface DecodedFilterSlug {
  attributes: Record<string, string[]>;
  brands: string[];
}

/**
 * Decode a filter slug produced by {@link encodeFilterSlug} back into attributes
 * + brands. Restores the `pa_` prefix on attribute names; routes the reserved
 * `brand` group into `brands`. Every value is unescaped. Returns empty
 * attributes + brands for an empty slug.
 */
export function decodeFilterSlug(slug: string): DecodedFilterSlug {
  const attributes: Record<string, string[]> = {};
  const brands: string[] = [];
  if (!slug) return { attributes, brands };

  for (const group of slug.split("_")) {
    const dotIdx = group.indexOf(".");
    if (dotIdx === -1) continue;
    const key = group.slice(0, dotIdx);
    const values = group
      .slice(dotIdx + 1)
      .split(".")
      .map(unescapeValue);
    if (!key || values.length === 0) continue;
    if (key === BRAND_GROUP_KEY) {
      brands.push(...values);
    } else {
      attributes[`pa_${key}`] = values;
    }
  }
  return { attributes, brands };
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
