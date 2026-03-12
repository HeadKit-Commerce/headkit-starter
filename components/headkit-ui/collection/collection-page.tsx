"use client";

import type {
  ProductSummaryFieldsFragment,
  ProductFilters,
} from "@headkit/sdk";
import { CollectionProvider } from "./collection-context";
import { Filter } from "./filter";
import { ActiveFilters } from "./active-filters";
import { ProductGrid } from "./product-grid";
import { LoadPrevious, LoadMore, ProductCount } from "./pagination";

interface CollectionPageProps {
  initialProducts: ProductSummaryFieldsFragment[];
  initialTotal: number;
  productFilter: ProductFilters;
  initialPage?: number;
  itemsPerPage?: number;
  onSale?: boolean;
  isNew?: boolean;
  search?: string;
  brandSlug?: string;
  categorySlug?: string;
}

export function CollectionPage({
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
}: CollectionPageProps) {
  return (
    <CollectionProvider
      initialProducts={initialProducts}
      initialTotal={initialTotal}
      productFilter={productFilter}
      initialPage={initialPage}
      itemsPerPage={itemsPerPage}
      onSale={onSale}
      isNew={isNew}
      search={search}
      brandSlug={brandSlug}
      categorySlug={categorySlug}
    >
      <div className="flex flex-col gap-4">
        <Filter />
        <ActiveFilters />
        <LoadPrevious />
        <ProductGrid />
        <div className="flex flex-col items-center gap-5 pb-10">
          <LoadMore />
          <ProductCount />
        </div>
      </div>
    </CollectionProvider>
  );
}
