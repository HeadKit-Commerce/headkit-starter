import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";

/**
 * Soft-nav fallback when Instant Navigation / Partial Prefetching is not
 * available (e.g. first visit before runtime prefetch completes).
 */
export default function Loading(): React.JSX.Element {
  return <CollectionPageSkeleton />;
}
