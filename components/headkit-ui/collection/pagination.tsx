"use client";

import { useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useCollection } from "./collection-context";

/**
 * Infinite scroll sentinel — triggers loadMore() when the element
 * becomes visible in the viewport. Falls back to a manual button
 * if IntersectionObserver is not available or the user prefers
 * reduced motion.
 */
export function LoadMore() {
  const { hasMore, isLoadingAfter, loadMore } = useCollection();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !isLoadingAfter) {
        loadMore();
      }
    },
    [hasMore, isLoadingAfter, loadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "400px",
      threshold: 0,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (!hasMore) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      {/* Accessible fallback button */}
      <Button
        variant="outline"
        onClick={loadMore}
        disabled={isLoadingAfter}
        className="w-full max-w-xs"
      >
        {isLoadingAfter ? "Loading…" : "Load More"}
      </Button>
    </div>
  );
}

export function LoadPrevious() {
  const { hasFirstPage, isLoadingBefore, currentPage, loadPrevious } =
    useCollection();
  if (hasFirstPage || currentPage <= 1) return null;
  return (
    <div className="flex justify-center px-5 md:px-10">
      <Button
        variant="outline"
        onClick={loadPrevious}
        disabled={isLoadingBefore}
        className="w-full max-w-xs"
      >
        {isLoadingBefore ? "Loading…" : "Load Previous"}
      </Button>
    </div>
  );
}

export function ProductCount() {
  const { products, totalProducts } = useCollection();
  if (!totalProducts) return null;
  return (
    <p className="text-sm text-gray-800">
      Viewing {products.length} of {totalProducts} products
    </p>
  );
}
