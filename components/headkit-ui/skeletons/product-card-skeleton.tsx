import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ProductCardSkeletonProps {
  className?: string;
  /** Show a colour-swatch row under the title (variable products). */
  showSwatches?: boolean;
  /** Static placeholders for CDN-sealed App Shells (no animate-pulse). */
  shell?: boolean;
}

/**
 * Layout-matched placeholder for {@link ProductCard}: square brand-radius
 * image, two-line title, optional swatches, and price.
 */
export function ProductCardSkeleton({
  className,
  showSwatches = false,
  shell = false,
}: ProductCardSkeletonProps) {
  const animated = !shell;
  return (
    <div className={cn("relative w-full", className)}>
      <Skeleton
        animated={animated}
        className="aspect-square w-full rounded-brand bg-white"
      />
      <div className="pt-3">
        <div className="flex flex-col gap-1 lg:flex-row lg:justify-between lg:gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton animated={animated} className="h-[17px] w-[88%]" />
            <Skeleton animated={animated} className="h-[17px] w-[62%]" />
            {showSwatches ? (
              <div className="flex items-center gap-2 pt-0.5">
                <Skeleton animated={animated} className="size-4 rounded-full" />
                <Skeleton animated={animated} className="size-4 rounded-full" />
                <Skeleton animated={animated} className="size-4 rounded-full" />
              </div>
            ) : null}
          </div>
          <Skeleton
            animated={animated}
            className="mt-1 h-4 w-14 shrink-0 lg:mt-0"
          />
        </div>
      </div>
    </div>
  );
}

interface ProductGridSkeletonProps {
  count?: number;
  className?: string;
  showSwatches?: boolean;
  shell?: boolean;
}

/** Grid shell matching ProductGrid breakpoints. */
export function ProductGridSkeleton({
  count = 4,
  className,
  showSwatches = false,
  shell = false,
}: ProductGridSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton
          key={i}
          showSwatches={showSwatches}
          shell={shell}
        />
      ))}
    </div>
  );
}
