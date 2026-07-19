import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense boundary for the private account subtree. These pages read the
 * auth cookie at request time (uncached data), so under Cache Components they
 * must render inside a Suspense boundary. Scoped here — NOT at the app root —
 * so public, cacheable pages stay in the prerendered static shell.
 */
export default function Loading() {
  return (
    <div className="space-y-4 px-5 py-8 md:px-10">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
