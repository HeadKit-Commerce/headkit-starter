import { Skeleton } from "@/components/ui/skeleton";

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
            <Skeleton className="mb-5 h-4 w-64" />
            {variant === "brand" && <Skeleton className="mb-3 h-20 w-40" />}
            <Skeleton className="mb-[10px] h-9 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
          {variant === "collection" && (
            <div className="flex justify-center md:justify-end md:pt-5">
              <Skeleton className="h-24 w-full max-w-xs rounded-lg md:h-32 md:w-64" />
            </div>
          )}
        </div>
        {variant === "collection" && (
          <div className="mt-6 px-4 md:px-10">
            <Skeleton className="mb-3 h-4 w-28" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-lg" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter bar — px-5 md:px-10 py-5 */}
      <div className="flex w-full items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Product grid — px-5 md:px-10, grid-cols-1 md:grid-cols-3 */}
      <div className="px-5 md:px-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>

      {/* LoadMore + ProductCount */}
      <div className="flex flex-col items-center gap-5 pb-10">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
