import type {
  ProductSummaryFieldsFragment,
  ProductFilters,
} from "@headkit/sdk";
import { CollectionProvider } from "./collection-context";
import { Filter } from "./filter";
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
  categoryBasePath?: string;
  initialFilterValues?: Record<string, string[]>;
  initialBrands?: string[];
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
  categoryBasePath,
  initialFilterValues,
  initialBrands,
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
      categoryBasePath={categoryBasePath}
      initialFilterValues={initialFilterValues}
      initialBrands={initialBrands}
    >
      <div className="flex flex-col gap-4">
        <Filter />
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
