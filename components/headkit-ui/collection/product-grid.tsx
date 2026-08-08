"use client";

import { useCollection } from "./collection-context";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { ProductCardSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";
import { CATALOG_GRID_CLASS } from "@/components/headkit-ui/catalog-grid";
import { useCatalogDisplay } from "@/components/headkit-ui/catalog-display-provider";
import { expandCatalogProducts } from "@/lib/catalog-display";

function LoadingSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={`skeleton-${i}`} />
      ))}
    </>
  );
}

export function ProductGrid() {
  const { products, isLoading, isLoadingBefore, isLoadingAfter, itemsPerPage } =
    useCollection();
  const { showVariants } = useCatalogDisplay();
  const catalogProducts = expandCatalogProducts(products, showVariants);

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

  const skeletonCount = Math.min(itemsPerPage, 8);

  return (
    <div className="px-5 md:px-10 z-5">
      <div className={CATALOG_GRID_CLASS}>
        {isLoadingBefore && <LoadingSkeleton count={skeletonCount} />}
        {catalogProducts.map((product, index) => (
          // Only the first two cards compete for LCP preload (ENG-856). Prefetching
          // four images on a phone wastes bandwidth when only one card is above the fold.
          // Off-screen rows defer layout/paint via content-visibility.
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 2}
            {...(index >= 4
              ? {
                  className:
                    "[content-visibility:auto] [contain-intrinsic-size:auto_360px]",
                }
              : {})}
          />
        ))}
        {(isLoading || isLoadingAfter) && (
          <LoadingSkeleton count={skeletonCount} />
        )}
      </div>
    </div>
  );
}
