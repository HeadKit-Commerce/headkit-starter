"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icon";

interface CarouselProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  carouselItemClassName?: string;
  id?: string;
  className?: string;
  gap?: string;
  padding?: string;
  /** Extra classes on the horizontal scroll track (e.g. `justify-center`). */
  trackClassName?: string;
  /**
   * Apply `justify-center` only when all items fit (no overflow).
   * Avoids the mobile bug where `justify-center` + overflow hides the first item.
   */
  centerWhenFits?: boolean;
  itemSizing?: {
    base: string;
    sm?: string;
    lg?: string;
  };
  showControls?: boolean;
  showScrollbar?: boolean;
  showPagination?: boolean;
  paginationDotClassName?: string;
  paginationClassName?: string;
  controlsPosition?: "top" | "bottom";
  scrollAmount?: number;
  autoplay?: {
    enabled: boolean;
    delay?: number;
    stopOnInteraction?: boolean;
  };
  loop?: boolean;
  useScrollSnap?: boolean;
  onSlideChange?: (index: number) => void;
}

const Carousel = <T,>({
  items,
  renderItem,
  carouselItemClassName,
  id = "carousel",
  className,
  gap = "gap-[14px]",
  padding = "px-5 md:px-10",
  trackClassName,
  centerWhenFits = false,
  itemSizing = {
    base: "w-[calc(91.666667%-7px)]",
    sm: "sm:w-[calc(50%-7px)]",
    lg: "lg:w-[calc(33.333333%-9.33px)]",
  },
  showControls = true,
  showScrollbar = true,
  showPagination = false,
  paginationDotClassName = "bg-gray-300",
  paginationClassName,
  controlsPosition = "top",
  scrollAmount = 0.5,
  autoplay,
  loop = false,
  useScrollSnap = false,
  onSlideChange,
}: CarouselProps<T>) => {
  const filteredItems =
    items?.filter((item) => item !== null && item !== undefined) || [];
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** True only after measure shows items fit — never center before that (mobile overflow). */
  const [fitsViewport, setFitsViewport] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateScrollState = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const overflows = scrollWidth > clientWidth + 1;
    setCanScroll(overflows);
    setFitsViewport(!overflows);
    setCanScrollPrev(scrollLeft > 0);
    setCanScrollNext(scrollLeft < scrollWidth - clientWidth - 1);
    setScrollProgress(overflows ? scrollLeft / (scrollWidth - clientWidth) : 0);
    if (useScrollSnap) {
      // Each snap slide spans the full container, so a slide's width is the
      // total scrollable width divided by the slide count. Clamp so the active
      // index never overflows the pagination dots.
      const itemWidth = scrollWidth / filteredItems.length;
      const rawIndex = itemWidth > 0 ? Math.round(scrollLeft / itemWidth) : 0;
      const newIndex = Math.min(
        Math.max(rawIndex, 0),
        filteredItems.length - 1,
      );
      setCurrentIndex(newIndex);
      if (onSlideChange && newIndex !== currentIndex) {
        onSlideChange(newIndex);
      }
    }
  }, [useScrollSnap, filteredItems.length, currentIndex, onSlideChange]);

  const getItemWidth = useCallback(() => {
    if (!containerRef.current) return 0;
    const itemElement = containerRef.current.querySelector(`#${id}-item-0`);
    return itemElement ? (itemElement as HTMLElement).clientWidth : 0;
  }, [id]);

  const scrollTo = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      if (!containerRef.current) return;
      const itemWidth = getItemWidth();
      const gapValue = parseInt(gap.replace("gap-", "")) || 0;
      const scrollLeft = index * (itemWidth + gapValue);
      containerRef.current.scrollTo({ left: scrollLeft, behavior });
      setCurrentIndex(index);
    },
    [gap, getItemWidth],
  );

  const scrollNext = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollWidth, clientWidth } = containerRef.current;
    const itemWidth = getItemWidth();
    const gapValue = parseInt(gap.replace("gap-", "")) || 0;
    let nextIndex = currentIndex + 1;
    const nextScrollLeft = nextIndex * (itemWidth + gapValue);
    if (nextScrollLeft >= scrollWidth - clientWidth + gapValue) {
      if (loop) {
        nextIndex = 0;
      } else {
        return;
      }
    }
    scrollTo(nextIndex);
  }, [currentIndex, loop, gap, scrollTo, getItemWidth]);

  const stopAutoplay = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startAutoplay = useCallback(() => {
    if (autoplay?.enabled && autoplay.delay && !isHovered && !isDragging) {
      stopAutoplay();
      intervalRef.current = setInterval(() => {
        scrollNext();
      }, autoplay.delay);
    }
  }, [autoplay, isHovered, isDragging, scrollNext]);

  const scrollToPrev = () => {
    if (!containerRef.current) return;
    const scrollAmountPx = containerRef.current.clientWidth * scrollAmount;
    containerRef.current.scrollBy({
      left: -scrollAmountPx,
      behavior: "smooth",
    });
  };

  const scrollToNext = () => {
    if (!containerRef.current) return;
    const scrollAmountPx = containerRef.current.clientWidth * scrollAmount;
    containerRef.current.scrollBy({ left: scrollAmountPx, behavior: "smooth" });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    updateScrollState();
    container.addEventListener("scroll", updateScrollState);
    return () => container.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState]);

  useEffect(() => {
    if (autoplay?.enabled) startAutoplay();
    return () => stopAutoplay();
  }, [autoplay?.enabled, startAutoplay]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (autoplay?.stopOnInteraction) stopAutoplay();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    startAutoplay();
  };

  const scrollToProgress = (progress: number) => {
    if (!containerRef.current) return;
    const { scrollWidth, clientWidth } = containerRef.current;
    containerRef.current.scrollTo({
      left: progress * (scrollWidth - clientWidth),
      behavior: "smooth",
    });
  };

  const itemSizeClasses = [itemSizing.base, itemSizing.sm, itemSizing.lg]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn("relative w-full", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex overflow-x-auto scroll-smooth",
          gap,
          padding,
          trackClassName,
          centerWhenFits && fitsViewport && "justify-center",
          useScrollSnap && "snap-x snap-mandatory",
          "[&::-webkit-scrollbar]:hidden",
        )}
      >
        {filteredItems.map((item, index) => (
          <div
            key={index}
            id={`${id}-item-${index}`}
            className={cn(
              "flex-none",
              useScrollSnap && "snap-start",
              itemSizeClasses,
              carouselItemClassName,
            )}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>

      {canScroll && showControls && (
        <div
          className={cn(
            "absolute flex gap-4 justify-end items-center",
            padding,
            controlsPosition === "top"
              ? "-top-[32px] right-0"
              : "bottom-4 right-0",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded-full hidden md:flex items-center justify-center"
            disabled={!canScrollPrev}
            onClick={scrollToPrev}
          >
            <ChevronLeftIcon
              className={cn(
                "h-5 w-5 text-primary transition-opacity hover:opacity-70",
                !canScrollPrev && "text-gray-300",
              )}
            />
            <span className="sr-only">Previous slide</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hidden md:flex items-center justify-center"
            disabled={!canScrollNext}
            onClick={scrollToNext}
          >
            <ChevronRightIcon
              className={cn(
                "h-5 w-5 text-primary transition-opacity hover:opacity-70",
                !canScrollNext && "text-gray-300",
              )}
            />
            <span className="sr-only">Next slide</span>
          </Button>
        </div>
      )}

      {canScroll && showScrollbar && (
        <div className={cn("mt-4 md:mt-6", padding)}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={scrollProgress}
            onChange={(e) => scrollToProgress(parseFloat(e.target.value))}
            aria-label="Carousel scroll"
            style={{ ["--thumb-w" as string]: "25%" }}
            className={cn(
              "w-full h-1 cursor-pointer appearance-none bg-transparent",
              "[&::-webkit-slider-runnable-track]:h-[1px] [&::-webkit-slider-runnable-track]:bg-transparent",
              "[&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-[rgba(220,220,220,1)]",
              "[&::-moz-range-track]:h-[1px] [&::-moz-range-track]:bg-transparent",
              "[&::-moz-range-track]:border [&::-moz-range-track]:border-[rgba(220,220,220,1)]",
              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[1px] [&::-webkit-slider-thumb]:w-[var(--thumb-w)]",
              "[&::-webkit-slider-thumb]:-mt-[1px] [&::-webkit-slider-thumb]:rounded-none",
              "[&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary",
              "[&::-webkit-slider-thumb]:shadow-none [&::-webkit-slider-thumb]:outline-none",
              "[&::-moz-range-thumb]:h-[1px] [&::-moz-range-thumb]:w-[var(--thumb-w)] [&::-moz-range-thumb]:rounded-none",
              "[&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-primary",
              "[&::-moz-range-thumb]:shadow-none [&::-moz-range-thumb]:outline-none",
            )}
          />
        </div>
      )}

      {showPagination && (
        <div
          className={cn(
            "absolute inset-x-0 z-20 flex justify-center",
            paginationClassName,
          )}
        >
          {filteredItems.map((_, index) => (
            // 24x24 hit area (WCAG target-size); the visual dot stays 8px.
            <button
              key={index}
              onClick={() => scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
              className="flex h-6 w-6 items-center justify-center cursor-pointer"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  paginationDotClassName,
                  currentIndex === index && "bg-white",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export { Carousel };
