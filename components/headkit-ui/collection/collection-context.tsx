"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useTransition,
} from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type {
  ProductSummaryFieldsFragment,
  ProductFilters,
} from "@headkit/sdk";
import { listCollectionProducts } from "@/lib/collection-actions";
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
  // Filter / catalog updates are non-urgent — keep checkbox/toggle INP low (ENG-856).
  const [, startFilterTransition] = useTransition();

  const [products, setProducts] = useState(initialProducts);
  const [totalProducts, setTotalProducts] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBefore, setIsLoadingBefore] = useState(false);
  const [isLoadingAfter, setIsLoadingAfter] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasFirstPage, setHasFirstPage] = useState(initialPage === 1);
  const prevAttributeSlugRef = useRef<string | undefined>(undefined);
  // Loading flags live in refs so fetchProducts never closes over a stale
  // isLoadingAfter=true after a filter change mid-request (that bug made
  // load-more permanently no-op while the UI looked idle).
  const isLoadingRef = useRef(false);
  const isLoadingBeforeRef = useRef(false);
  const isLoadingAfterRef = useRef(false);
  const productsCountRef = useRef(initialProducts.length);
  productsCountRef.current = products.length;

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

      // Always use replaceState for query/path sync during client pagination.
      // router.replace() remounts searchParams-driven Suspense islands (e.g.
      // /shop) and wipes the appended product list back to a single page.
      if (categoryBasePath) {
        const filterSlug = encodeFilterSlug(filters);
        const filterPath = filterSlug ? `/f/${filterSlug}` : "";
        const qs = params.toString();
        window.history.replaceState(
          null,
          "",
          `${categoryBasePath}${filterPath}${qs ? `?${qs}` : ""}`,
        );
      } else {
        for (const [slug, vals] of Object.entries(filters.attributes)) {
          if (vals.length) params.set(slug, vals.join(","));
        }
        const qs = params.toString();
        window.history.replaceState(
          null,
          "",
          `${pathname}${qs ? `?${qs}` : ""}`,
        );
      }
    },
    [categoryBasePath, pathname, search],
  );

  const fetchProducts = useCallback(
    async (page: number, position: "before" | "after" | "middle") => {
      if (
        isLoadingRef.current ||
        isLoadingBeforeRef.current ||
        isLoadingAfterRef.current
      ) {
        return;
      }

      if (position === "before") {
        isLoadingBeforeRef.current = true;
        setIsLoadingBefore(true);
      } else if (position === "after") {
        isLoadingAfterRef.current = true;
        setIsLoadingAfter(true);
      } else {
        isLoadingRef.current = true;
        setIsLoading(true);
      }

      try {
        const filter = buildProductListFilter(filterValues, {
          ...(categorySlug !== undefined ? { categorySlug } : {}),
          ...(brandSlug !== undefined ? { brandSlug } : {}),
          ...(onSale !== undefined ? { onSale } : {}),
          ...(isNew !== undefined ? { isNew } : {}),
          ...(search !== undefined ? { search } : {}),
        });
        const result = await listCollectionProducts(filter, page, itemsPerPage);

        // Empty "after" page means we've exhausted the list — clamp the total
        // so hasMore flips false and the sentinel stops firing.
        if (position === "after" && result.products.length === 0) {
          setTotalProducts(productsCountRef.current);
          return;
        }

        // Commit product appends synchronously — do NOT wrap in startTransition.
        // Loading flags clear in `finally` as urgent updates; an urgent clear
        // after a transition-scheduled append interrupts that transition, so
        // Load More flickered "Loading…" then never grew the grid (ENG-856
        // regression). Filter checkbox INP still uses startFilterTransition.
        setCurrentPage(page);
        setTotalProducts(result.total);

        if (position === "middle") {
          setProducts(result.products);
          setHasFirstPage(page === 1);
        } else if (position === "before") {
          setProducts((prev) => [...result.products, ...prev]);
          if (page === 1) setHasFirstPage(true);
        } else {
          setProducts((prev) => [...prev, ...result.products]);
        }

        syncUrl(page, filterValues);
      } catch {
        // Keep the previous product list; loading flags clear in finally so the
        // user can retry via the Load More button.
      } finally {
        if (position === "before") {
          isLoadingBeforeRef.current = false;
          setIsLoadingBefore(false);
        } else if (position === "after") {
          isLoadingAfterRef.current = false;
          setIsLoadingAfter(false);
        } else {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
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

  const loadMore = useCallback(() => {
    if (isLoadingAfterRef.current) return;
    if (productsCountRef.current >= totalProducts) return;
    void fetchProducts(currentPage + 1, "after");
  }, [currentPage, fetchProducts, totalProducts]);

  const loadPrevious = useCallback(() => {
    if (isLoadingBeforeRef.current || currentPage <= 1) return;
    void fetchProducts(currentPage - 1, "before");
  }, [currentPage, fetchProducts]);

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

  const setFilterValuesDeferred = useCallback(
    (values: FilterValues) => {
      startFilterTransition(() => {
        setFilterValues(values);
      });
    },
    [startFilterTransition],
  );

  const clearFilters = useCallback(() => {
    startFilterTransition(() => {
      setFilterValues({ ...DEFAULT_FILTER_VALUES, page: 1 });
    });
  }, [startFilterTransition]);

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
        setFilterValues: setFilterValuesDeferred,
        clearFilters,
        loadMore,
        loadPrevious,
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
