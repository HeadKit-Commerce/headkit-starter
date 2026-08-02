import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";

interface CollectionPageSkeletonProps {
  /** "collection" = breadcrumb + h1 + description + optional thumbnail + subcategories row; "brand" = breadcrumb + h1 + optional description/thumbnail only */
  variant?: "collection" | "brand";
}

export function CollectionPageSkeleton({
  variant = "collection",
}: CollectionPageSkeletonProps) {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Header — px-4 md:px-10, grid matching CollectionHeader / BrandHeader */}
      <div className="overflow-x-hidden">
        <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
          <div className="pt-5">
            <Skeleton className="mb-5 h-4 w-48 max-w-full sm:w-64" />
            {variant === "brand" && (
              <Skeleton className="mb-3 h-20 w-40 rounded-brand" />
            )}
            <Skeleton className="mb-[10px] h-9 w-40 max-w-full sm:w-56" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-full max-w-md" />
              <Skeleton className="h-5 w-3/4 max-w-sm" />
            </div>
          </div>
          {variant === "collection" && (
            <div className="flex justify-center md:justify-end md:pt-5">
              <Skeleton className="h-24 w-full max-w-xs rounded-brand md:h-32 md:w-64" />
            </div>
          )}
        </div>
        {variant === "collection" && (
          <div className="mt-6 px-4 md:px-10">
            <Skeleton className="mb-3 h-4 w-28" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-brand" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter bar — matches sticky Filter chrome */}
      <div className="flex w-full items-center justify-between bg-brand-bg/80 px-5 py-5 md:px-10">
        <div className="flex items-center gap-2 overflow-hidden">
          <Skeleton className="hidden h-10 w-24 rounded-brand md:block" />
          <Skeleton className="hidden h-10 w-20 rounded-brand md:block" />
          <Skeleton className="hidden h-10 w-16 rounded-brand md:block" />
          <Skeleton className="h-10 w-24 rounded-brand md:hidden" />
        </div>
        <Skeleton className="h-10 w-28 rounded-brand sm:w-32" />
      </div>

      {/* Product grid — same breakpoints as ProductGrid */}
      <div className="px-5 md:px-10">
        <ProductGridSkeleton count={12} />
      </div>

      {/* LoadMore + ProductCount */}
      <div className="flex flex-col items-center gap-5 pb-10 pt-6">
        <Skeleton className="h-10 w-full max-w-xs rounded-brand" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

/** Filter bar + product grid only — used inside Suspense around CollectionPage. */
export function CollectionProductsSkeleton() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex w-full items-center justify-between bg-brand-bg/80 px-5 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-brand" />
          <Skeleton className="hidden h-10 w-20 rounded-brand sm:block" />
        </div>
        <Skeleton className="h-10 w-28 rounded-brand" />
      </div>
      <div className="px-5 md:px-10">
        <ProductGridSkeleton count={12} />
      </div>
    </div>
  );
}
