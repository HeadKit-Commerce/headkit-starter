import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";

interface CollectionPageSkeletonProps {
  /** "collection" = breadcrumb + h1 + description; "brand" = breadcrumb + h1 */
  variant?: "collection" | "brand";
}

/**
 * Lean App Shell fallback for Instant Navigation / Partial Prefetching.
 *
 * Kept intentionally sparse: few static placeholders (no `animate-pulse`) so
 * the CDN-sealed RSC HTML stays small. Layout reservation only — real content
 * streams into Suspense islands after navigation.
 *
 * @see https://nextjs.org/docs/app/guides/adopting-partial-prefetching
 */
export function CollectionPageSkeleton({
  variant = "collection",
}: CollectionPageSkeletonProps) {
  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          <Skeleton animated={false} className="mb-5 h-4 w-40 max-w-full" />
          {variant === "brand" ? (
            <Skeleton
              animated={false}
              className="mb-3 h-16 w-32 rounded-brand"
            />
          ) : null}
          <Skeleton
            animated={false}
            className="mb-[10px] h-8 w-44 max-w-full"
          />
          <Skeleton animated={false} className="h-4 w-full max-w-sm" />
        </div>
        {variant === "collection" ? (
          <div className="flex justify-center md:justify-end md:pt-5">
            <Skeleton
              animated={false}
              className="h-20 w-full max-w-xs rounded-brand md:h-28 md:w-56"
            />
          </div>
        ) : null}
      </div>

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
        {/* 4 cards ≈ one desktop row — enough layout reserve, minimal RSC bytes */}
        <ProductGridSkeleton count={4} shell />
      </div>
    </div>
  );
}
