import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";

interface CollectionPageSkeletonProps {
  /** "collection" = h1 + description (+ optional featured image); "brand" = h1 */
  variant?: "collection" | "brand";
}

/**
 * Layout-matched App Shell fallback for Instant Navigation / Partial Prefetching.
 *
 * Mirrors CollectionHeader + optional subcategory strip + filter bar + product
 * grid proportions so first paint / IN transitions don't jump when content
 * streams in. Kept static (no `animate-pulse`) so CDN-sealed RSC HTML stays lean.
 *
 * @see https://nextjs.org/docs/app/guides/adopting-partial-prefetching
 */
export function CollectionPageSkeleton({
  variant = "collection",
}: CollectionPageSkeletonProps) {
  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-6 px-5 md:grid-cols-12 md:gap-8 md:px-10 md:pt-8">
        <div className="pt-5 md:col-span-4 md:pt-0">
          {variant === "brand" ? (
            <Skeleton
              animated={false}
              className="mb-3 h-16 w-32 rounded-brand"
            />
          ) : null}
          <Skeleton
            animated={false}
            className="mb-[10px] h-9 w-56 max-w-full"
          />
          <div className="space-y-2">
            <Skeleton animated={false} className="h-4 w-full max-w-md" />
            <Skeleton animated={false} className="h-4 w-full max-w-sm" />
          </div>
        </div>
        {variant === "collection" ? (
          <Skeleton
            animated={false}
            className="aspect-[915/458] w-full md:col-span-8 md:aspect-auto md:min-h-[320px]"
          />
        ) : null}
      </div>

      {/* Subcategory / child carousel strip (common on parent categories) */}
      {variant === "collection" ? (
        <div className="mb-5 flex gap-[30px] overflow-hidden px-5 md:px-10">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton
              key={i}
              animated={false}
              className="h-24 w-36 shrink-0 rounded-brand md:h-28 md:w-44"
            />
          ))}
        </div>
      ) : null}

      <CollectionProductsSkeleton />
    </div>
  );
}

/** Filter bar + lean product grid — Suspense island / loading.tsx shell. */
export function CollectionProductsSkeleton() {
  return (
    <div>
      <div className="flex w-full items-center justify-between bg-brand-bg/80 px-5 py-5 md:px-10">
        <Skeleton animated={false} className="h-10 w-24 rounded-brand" />
        <Skeleton animated={false} className="h-10 w-28 rounded-brand" />
      </div>
      <div className="px-5 md:px-10">
        {/* One desktop row (4) + partial second — matches ProductGrid breakpoints */}
        <ProductGridSkeleton count={8} shell />
      </div>
    </div>
  );
}
