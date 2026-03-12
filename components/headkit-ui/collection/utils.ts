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
