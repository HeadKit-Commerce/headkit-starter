import { Skeleton } from "@/components/ui/skeleton";

/**
 * Segment Suspense boundary for project detail. Params aren't fully enumerated
 * at build, so param-dependent reads need a boundary here.
 * Skeleton mirrors {@link FeaturedImageHeader} / MainCarousel hero heights.
 */
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6 py-8">
      <div className="mx-5 overflow-hidden">
        <Skeleton className="aspect-square w-full rounded-brand md:aspect-auto md:h-[60vh] lg:h-[80vh]" />
      </div>
      <div className="space-y-3 px-5 md:px-10">
        <Skeleton className="h-4 w-40" />
        <div className="mx-auto max-w-3xl space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
