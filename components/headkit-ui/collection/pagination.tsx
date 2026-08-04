"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useCollection } from "./collection-context";

/**
 * Infinite scroll sentinel — triggers loadMore() when the element
 * becomes visible in the viewport. Falls back to a manual button
 * if IntersectionObserver is not available or the user prefers
 * reduced motion.
 */
export function LoadMore() {
  const { hasMore, isLoadingAfter, loadMore, currentPage } = useCollection();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingAfterRef = useRef(isLoadingAfter);

  // Keep observer callbacks current without writing refs during render
  // (eslint react-hooks/refs — "Cannot access refs during render").
  useEffect(() => {
    loadMoreRef.current = loadMore;
    hasMoreRef.current = hasMore;
    isLoadingAfterRef.current = isLoadingAfter;
  }, [loadMore, hasMore, isLoadingAfter]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    // Re-bind only when the page advances (successful append) or hasMore
    // changes — NOT when isLoadingAfter flips. Re-observing on every failed
    // fetch caused a CORS/error retry storm that left the button stuck on
    // "Loading…".
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          hasMoreRef.current &&
          !isLoadingAfterRef.current
        ) {
          loadMoreRef.current();
        }
      },
      {
        rootMargin: "400px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, currentPage]);

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
