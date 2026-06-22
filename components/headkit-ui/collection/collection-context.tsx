"use client";

import {
  createContext,
  useContext,
  useEffect,
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

  const [filterValues, setFilterValues] = useState<FilterValues>(() => {
    const vals: FilterValues = { ...DEFAULT_FILTER_VALUES, page: initialPage };
    const categories =
      searchParams.get("categories")?.split(",").filter(Boolean) ?? [];
    if (categories.length) vals.categories = categories;
    const brands = searchParams.get("brands")?.split(",").filter(Boolean) ?? [];
    if (brands.length) vals.brands = brands;
    productFilter.attributes?.forEach((attr) => {
      if (!attr?.slug) return;
      const values =
        searchParams.get(attr.slug)?.split(",").filter(Boolean) ?? [];
      if (values.length) vals.attributes[attr.slug] = values;
    });
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
      if (filters.brands.length) params.set("brands", filters.brands.join(","));
      for (const [slug, vals] of Object.entries(filters.attributes)) {
        if (vals.length) params.set(slug, vals.join(","));
      }
      if (filters.instock) params.set("instock", "true");
      if (filters.sort) params.set("sort", filters.sort);
      if (filters.price_min) params.set("price_min", filters.price_min);
      if (filters.price_max) params.set("price_max", filters.price_max);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, search],
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
    if (!isInitialLoad) fetchProducts(1, "middle");
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
