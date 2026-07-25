"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { createClientSDK } from "@headkit/sdk";
import type {
  ProductSummaryFieldsFragment,
  ProductFilters,
} from "@headkit/sdk";
import {
  buildProductListFilter,
  encodeFilterSlug,
  DEFAULT_FILTER_VALUES,
  type FilterValues,
  type SortKeyType,
} from "./utils";

interface CollectionContextType {
  products: ProductSummaryFieldsFragment[];
  totalProducts: number;
  currentPage: number;
  itemsPerPage: number;
  isLoading: boolean;
  isLoadingBefore: boolean;
  isLoadingAfter: boolean;
  hasMore: boolean;
  hasFirstPage: boolean;
  filterValues: FilterValues;
  setFilterValues: (values: FilterValues) => void;
  clearFilters: () => void;
  loadMore: () => void;
  loadPrevious: () => void;
  productFilter: ProductFilters;
}

interface CollectionProviderProps {
  children: React.ReactNode;
  initialProducts: ProductSummaryFieldsFragment[];
  initialTotal: number;
  productFilter: ProductFilters;
  initialPage?: number;
  itemsPerPage?: number;
  onSale?: boolean | undefined;
  isNew?: boolean | undefined;
  search?: string | undefined;
  brandSlug?: string | undefined;
  categorySlug?: string | undefined;
  /** Base path for the collection (e.g. `/collections/hoodies`). When provided, attribute
   *  filters are encoded into the URL path as `/f/{slug}` and URL updates use
   *  `window.history.replaceState` instead of the Next.js router to avoid server re-renders. */
  categoryBasePath?: string | undefined;
  /** Attribute filter values decoded from the URL path by the server component. Takes
   *  precedence over search-param attributes when present. */
  initialFilterValues?: Record<string, string[]> | undefined;
  /** Brand values decoded from the URL path by the server component (06.1). When
   *  present, seeds `filterValues.brands` so the brand sidebar hydrates checked. */
  initialBrands?: string[] | undefined;
}

const CollectionContext = createContext<CollectionContextType | null>(null);

export function CollectionProvider({
  children,
  initialProducts,
  initialTotal,
  productFilter,
  initialPage = 1,
  itemsPerPage = 24,
  onSale,
  isNew,
  search,
  brandSlug,
  categorySlug,
  categoryBasePath,
  initialFilterValues,
  initialBrands,
}: CollectionProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [products, setProducts] = useState(initialProducts);
  const [totalProducts, setTotalProducts] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBefore, setIsLoadingBefore] = useState(false);
  const [isLoadingAfter, setIsLoadingAfter] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasFirstPage, setHasFirstPage] = useState(initialPage === 1);
  const prevAttributeSlugRef = useRef<string | undefined>(undefined);

  const [filterValues, setFilterValues] = useState<FilterValues>(() => {
    const vals: FilterValues = { ...DEFAULT_FILTER_VALUES, page: initialPage };
    const categories =
      searchParams.get("categories")?.split(",").filter(Boolean) ?? [];
    if (categories.length) vals.categories = categories;
    // Brand is path-encoded (06.1): the server decodes it from the `/f/` slug and
    // passes it via initialBrands. That takes precedence over the legacy
    // `?brands=` query param (still read as a fallback for old/in-flight URLs).
    if (initialBrands && initialBrands.length > 0) {
      vals.brands = initialBrands;
    } else {
      const brands =
        searchParams.get("brands")?.split(",").filter(Boolean) ?? [];
      if (brands.length) vals.brands = brands;
    }
    // Path-decoded attributes take precedence; fall back to search params for legacy URLs.
    if (initialFilterValues && Object.keys(initialFilterValues).length > 0) {
      vals.attributes = initialFilterValues;
    } else {
      productFilter.attributes?.forEach((attr) => {
        if (!attr?.slug) return;
        const values =
          searchParams.get(attr.slug)?.split(",").filter(Boolean) ?? [];
        if (values.length) vals.attributes[attr.slug] = values;
      });
    }
    vals.instock = searchParams.get("instock") === "true";
    vals.sort = (searchParams.get("sort") ?? "") as SortKeyType | "";
    const priceMin = searchParams.get("price_min");
    if (priceMin) vals.price_min = priceMin;
    const priceMax = searchParams.get("price_max");
    if (priceMax) vals.price_max = priceMax;
    return vals;
  });

  const hasMore = products.length < totalProducts;

  const sdk = useMemo(() => createClientSDK(), []);

  const syncUrl = useCallback(
    (page: number, filters: FilterValues) => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (page > 1) params.set("page", page.toString());
      if (filters.categories.length)
        params.set("categories", filters.categories.join(","));
      // Brand is path-encoded (06.1) — NEVER a query param. It rides in the
      // `/f/` slug via encodeFilterSlug below. price/sort/page stay query.
      if (filters.instock) params.set("instock", "true");
      if (filters.sort) params.set("sort", filters.sort);
      if (filters.price_min) params.set("price_min", filters.price_min);
      if (filters.price_max) params.set("price_max", filters.price_max);
      const qs = params.toString();

      if (categoryBasePath) {
        // Path-based mode: encode attribute + brand filters into the URL path, keep
        // other state in search params. Use replaceState to avoid server re-renders
        // on every filter toggle.
        const filterSlug = encodeFilterSlug(filters);
        const filterPath = filterSlug ? `/f/${filterSlug}` : "";
        window.history.replaceState(
          null,
          "",
          `${categoryBasePath}${filterPath}${qs ? `?${qs}` : ""}`,
        );
      } else {
        // Fallback: keep everything in search params (used outside collection routes).
        for (const [slug, vals] of Object.entries(filters.attributes)) {
          if (vals.length) params.set(slug, vals.join(","));
        }
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      }
    },
    [categoryBasePath, pathname, router, search],
  );

  const fetchProducts = useCallback(
    async (page: number, position: "before" | "after" | "middle") => {
      if (isLoading || isLoadingBefore || isLoadingAfter) return;
      if (position === "before") setIsLoadingBefore(true);
      else if (position === "after") setIsLoadingAfter(true);
      else setIsLoading(true);

      try {
        const filter = buildProductListFilter(filterValues, {
          ...(categorySlug !== undefined ? { categorySlug } : {}),
          ...(brandSlug !== undefined ? { brandSlug } : {}),
          ...(onSale !== undefined ? { onSale } : {}),
          ...(isNew !== undefined ? { isNew } : {}),
          ...(search !== undefined ? { search } : {}),
        });
        const result = await sdk.collections.list(filter, page, itemsPerPage);

        if (position === "after" && result.products.length === 0) return;

        setCurrentPage(page);
        setTotalProducts(result.total);

        if (position === "middle") {
          setProducts(result.products as ProductSummaryFieldsFragment[]);
          setHasFirstPage(page === 1);
        } else if (position === "before") {
          setProducts((prev) => [
            ...(result.products as ProductSummaryFieldsFragment[]),
            ...prev,
          ]);
          if (page === 1) setHasFirstPage(true);
        } else {
          setProducts((prev) => [
            ...prev,
            ...(result.products as ProductSummaryFieldsFragment[]),
          ]);
        }

        syncUrl(page, filterValues);
      } catch {
        // Silently handle — error boundary will catch critical failures
      } finally {
        if (position === "before") setIsLoadingBefore(false);
        else if (position === "after") setIsLoadingAfter(false);
        else setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filterValues,
      categorySlug,
      brandSlug,
      onSale,
      isNew,
      search,
      itemsPerPage,
      syncUrl,
    ],
  );

  useEffect(() => {
    if (!isInitialLoad) {
      const newAttributeSlug = encodeFilterSlug(filterValues);
      if (
        categoryBasePath &&
        newAttributeSlug !== prevAttributeSlugRef.current
      ) {
        // Attribute/brand filters changed — navigate to the new filter path so the
        // server renders the correct products from cache (static per filter combo).
        // Brand is part of newAttributeSlug now (06.1), so toggling a brand drives
        // a path change, not a query param.
        prevAttributeSlugRef.current = newAttributeSlug;
        const filterPath = newAttributeSlug ? `/f/${newAttributeSlug}` : "";
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (filterValues.categories.length)
          params.set("categories", filterValues.categories.join(","));
        // Brand omitted from query (06.1) — it lives in filterPath.
        if (filterValues.instock) params.set("instock", "true");
        if (filterValues.sort) params.set("sort", filterValues.sort);
        const qs = params.toString();
        router.push(`${categoryBasePath}${filterPath}${qs ? `?${qs}` : ""}`);
        return;
      }
      prevAttributeSlugRef.current = newAttributeSlug;
      fetchProducts(filterValues.page, "middle");
    }
    setIsInitialLoad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues]);

  const clearFilters = () =>
    setFilterValues({ ...DEFAULT_FILTER_VALUES, page: 1 });

  return (
    <CollectionContext.Provider
      value={{
        products,
        totalProducts,
        currentPage,
        itemsPerPage,
        isLoading,
        isLoadingBefore,
        isLoadingAfter,
        hasMore,
        hasFirstPage,
        filterValues,
        setFilterValues,
        clearFilters,
        loadMore: () => fetchProducts(currentPage + 1, "after"),
        loadPrevious: () => {
          if (currentPage > 1) fetchProducts(currentPage - 1, "before");
        },
        productFilter,
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection(): CollectionContextType {
  const ctx = useContext(CollectionContext);
  if (!ctx)
    throw new Error("useCollection must be used within CollectionProvider");
  return ctx;
}
