"use client";

import { useCollection } from "./collection-context";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { ProductCardSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";
import {
  CATALOG_GRID_CLASS,
  CATALOG_ROW_QUANTUM,
} from "@/components/headkit-ui/catalog-grid";
import { useCatalogDisplay } from "@/components/headkit-ui/catalog-display-provider";
import {
  expandCatalogProducts,
  partitionFullRows,
} from "@/lib/catalog-display";

function LoadingSkeleton({
  count = CATALOG_ROW_QUANTUM,
  showSwatches = false,
}: {
  count?: number;
  showSwatches?: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton
          key={`skeleton-${i}`}
          showSwatches={showSwatches}
        />
      ))}
    </>
  );
}

export function ProductGrid({
  /**
   * When the collection header already owns LCP (leaf featured thumbnail),
   * skip grid `priority` so product cards do not steal bandwidth.
   */
  preferHeaderLcp = false,
}: {
  preferHeaderLcp?: boolean;
} = {}) {
  const { products, isLoading, isLoadingBefore, isLoadingAfter, hasMore } =
    useCollection();
  const { showVariants, showSwatches } = useCatalogDisplay();
  const catalogProducts = expandCatalogProducts(products, showVariants);
  // Hold incomplete trailing rows while more parent products can still load —
  // otherwise empty CSS-grid cells look like blank cards above Load More.
  const { visible: visibleProducts } = partitionFullRows(catalogProducts, {
    includeRemainder: !hasMore,
  });

  const isEmpty =
    !isLoading &&
    !isLoadingBefore &&
    !isLoadingAfter &&
    catalogProducts.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <p className="text-lg font-medium text-gray-900">No products found</p>
        <p className="mt-2 text-sm text-gray-500">
          Try adjusting your filters or browse other categories.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 md:px-10 z-5">
      {/* Section heading so card titles can be h3 (same depth as carousels)
          without skipping a level after the collection h1. */}
      <h2 className="sr-only">Products</h2>
      <div className={CATALOG_GRID_CLASS}>
        {isLoadingBefore && (
          <LoadingSkeleton
            count={CATALOG_ROW_QUANTUM}
            showSwatches={showSwatches}
          />
        )}
        {visibleProducts.map((product, index) => (
          // Only the first above-the-fold card may compete for LCP. Prefetching
          // two+ images on a phone wastes bandwidth when filters push the grid
          // down; when the leaf header image owns LCP, skip priority entirely.
          // Off-screen rows defer layout/paint via content-visibility.
          <ProductCard
            key={product.id}
            product={product}
            isNew={product.isNew}
            titleAs="h3"
            priority={!preferHeaderLcp && index === 0}
            {...(index >= 4
              ? {
                  className:
                    "[content-visibility:auto] [contain-intrinsic-size:auto_360px]",
                }
              : {})}
          />
        ))}
        {(isLoading || isLoadingAfter) && (
          <LoadingSkeleton
            count={CATALOG_ROW_QUANTUM}
            showSwatches={showSwatches}
          />
        )}
      </div>
    </div>
  );
}
