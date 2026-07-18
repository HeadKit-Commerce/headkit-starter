"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCollection } from "./collection-context";
import { ProductCard } from "@/components/headkit-ui/product-card";

function LoadingSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="col-span-1">
          <div className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}

export function ProductGrid() {
  const { products, isLoading, isLoadingBefore, isLoadingAfter } =
    useCollection();

  const isEmpty = !isLoading && !isLoadingBefore && !isLoadingAfter && products.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <p className="text-lg font-medium text-gray-900">No products found</p>
        <p className="mt-2 text-sm text-gray-500">Try adjusting your filters or browse other categories.</p>
      </div>
    );
  }

  return (
    <div className="px-5 md:px-10 z-5">
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {isLoadingBefore && <LoadingSkeleton />}
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        {(isLoading || isLoadingAfter) && <LoadingSkeleton />}
      </div>
    </div>
  );
}
