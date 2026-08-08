import { CATALOG_GRID_CLASS } from "@/components/headkit-ui/catalog-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EditorialGridSkeletonProps {
  count?: number;
  /** Post listings use video; project listings use square. */
  aspect?: "video" | "square";
  className?: string;
}

/** Grid shell matching PostGrid / ProjectGrid (collection breakpoints). */
export function EditorialGridSkeleton({
  count = 8,
  aspect = "video",
  className,
}: EditorialGridSkeletonProps): React.ReactElement {
  const aspectClass = aspect === "video" ? "aspect-video" : "aspect-square";
  return (
    <div className={cn("z-5 px-5 md:px-10", className)}>
      <div className={CATALOG_GRID_CLASS}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <Skeleton
              animated={false}
              className={cn(aspectClass, "w-full rounded-brand")}
            />
            <Skeleton animated={false} className="mt-3 h-5 w-3/4" />
            <Skeleton animated={false} className="mt-2 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
