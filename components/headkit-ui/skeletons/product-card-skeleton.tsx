import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ProductCardSkeletonProps {
  className?: string;
  /** Show a colour-swatch row under the title (variable products). */
  showSwatches?: boolean;
}

/**
 * Layout-matched placeholder for {@link ProductCard}: square brand-radius
 * image, two-line title, optional swatches, and price.
 */
export function ProductCardSkeleton({
  className,
  showSwatches = true,
}: ProductCardSkeletonProps) {
  return (
    <div
      className={cn("relative w-full rounded-brand bg-white p-3", className)}
    >
      <Skeleton className="aspect-square w-full rounded-brand bg-primary/5" />
      <div className="pt-3">
        <div className="flex flex-col gap-1 lg:flex-row lg:justify-between lg:gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-[17px] w-[88%]" />
            <Skeleton className="h-[17px] w-[62%]" />
            {showSwatches ? (
              <div className="flex items-center gap-2 pt-0.5">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="size-4 rounded-full" />
              </div>
            ) : null}
          </div>
          <Skeleton className="mt-1 h-4 w-14 shrink-0 lg:mt-0" />
        </div>
      </div>
    </div>
  );
}

interface ProductGridSkeletonProps {
  count?: number;
  className?: string;
}

/** Grid shell matching ProductGrid breakpoints. */
export function ProductGridSkeleton({
  count = 8,
  className,
}: ProductGridSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
