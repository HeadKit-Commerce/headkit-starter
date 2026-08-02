import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";

export default function ProductLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Breadcrumb — same container as page */}
      <div className="px-5 pt-6 md:px-10">
        <Skeleton className="h-4 w-48 max-w-full sm:w-64" />
      </div>

      {/* Content — px-5 py-8 md:px-10, grid matching ProductDetail */}
      <div className="px-5 py-8 md:px-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Left: gallery — 2-col grid, one col-span-2 + two col-span-1 */}
          <div className="hidden gap-5 md:grid md:grid-cols-2">
            <Skeleton className="col-span-2 aspect-square w-full rounded-brand" />
            <Skeleton className="aspect-square w-full rounded-brand" />
            <Skeleton className="aspect-square w-full rounded-brand" />
          </div>
          <div className="block md:hidden">
            <Skeleton className="aspect-square w-full rounded-brand" />
          </div>

          {/* Right: product info */}
          <div className="flex flex-col">
            <Skeleton className="mb-3 h-8 w-3/4 md:h-9" />
            <Skeleton className="mb-5 h-5 w-full" />
            <Skeleton className="mb-5 h-5 w-2/3" />
            <div className="mb-5 flex flex-col gap-4">
              <Skeleton className="h-5 w-20" />
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="size-10 rounded-full" />
                ))}
              </div>
            </div>
            <Skeleton className="mb-4 h-5 w-24" />
            <Skeleton className="mb-6 h-8 w-32" />
            <div className="mb-6 flex items-center gap-3">
              <Skeleton className="h-12 w-24 rounded-brand-button" />
              <Skeleton className="h-12 flex-1 rounded-brand-button" />
            </div>
          </div>
        </div>
      </div>

      {/* You might also like */}
      <section className="overflow-hidden py-10">
        <div className="px-5 md:px-10">
          <div className="grid w-full grid-cols-1 gap-x-8 gap-y-2 py-5 md:grid-cols-3">
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
