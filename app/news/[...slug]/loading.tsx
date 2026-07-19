import { Skeleton } from "@/components/ui/skeleton";

/**
 * Segment Suspense boundary. Params on this route aren't enumerated at build
 * (no full generateStaticParams coverage), so the page's param-dependent reads
 * suspend during the fallback-shell prerender and need a boundary here.
 */
export default function Loading() {
  return (
    <div className="space-y-4 px-5 py-8 md:px-10">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
