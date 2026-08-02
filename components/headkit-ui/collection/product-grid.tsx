"use client";

import { useCollection } from "./collection-context";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { ProductCardSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";

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

  const isEmpty =
    !isLoading && !isLoadingBefore && !isLoadingAfter && products.length === 0;

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
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {isLoadingBefore && <LoadingSkeleton count={skeletonCount} />}
        {products.map((product, index) => (
          // First row (up to 4 cards at the widest breakpoint) is eager: the
          // first visible card image is the PLP's LCP element (RC-2).
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 4}
          />
        ))}
        {(isLoading || isLoadingAfter) && (
          <LoadingSkeleton count={skeletonCount} />
        )}
      </div>
    </div>
  );
}
