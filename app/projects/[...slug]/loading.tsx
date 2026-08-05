import { Skeleton } from "@/components/ui/skeleton";

/**
 * Segment Suspense boundary for project detail. Params aren't fully enumerated
 * at build, so param-dependent reads need a boundary here.
 */
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6 px-5 py-8 md:px-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-2/3 max-w-xl" />
      <Skeleton className="aspect-[16/9] w-full max-w-4xl rounded-brand" />
      <div className="max-w-3xl space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
