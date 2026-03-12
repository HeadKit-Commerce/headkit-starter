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

  return (
    <div className="px-5 md:px-10 z-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {isLoadingBefore && <LoadingSkeleton />}
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        {(isLoading || isLoadingAfter) && <LoadingSkeleton />}
      </div>
    </div>
  );
}
