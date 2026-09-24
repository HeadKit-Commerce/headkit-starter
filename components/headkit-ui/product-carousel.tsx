"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { ProductCard } from "@/components/headkit-ui/product-card";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import {
  collapseCatalogProducts,
  type ColourwayPins,
} from "@/lib/catalog-display";

interface Props {
  products: ProductSummaryFieldsFragment[];
  carouselItemClassName?: string;
  id?: string;
  /** Optional admin pins from handpicked-products `productColourways`. */
  colourwayPins?: ColourwayPins | null | undefined;
  /**
   * How many leading cards get `prefetch={true}`. Zero is the default, which
   * leaves every card on `InstantLink`'s own resolution: a full prefetch today,
   * or nothing under the prefetch budget
   * (`NEXT_PUBLIC_NAV_PREFETCH_BUDGET` — see `lib/nav-interaction-flags.ts`).
   * Only the page's FIRST product carousel should opt in, and only for its first
   * visible row.
   */
  prefetchCount?: number;
}

/**
 * The first visible row of a default `Carousel`: its `itemSizing` is ~1 column at
 * base, 2 from `sm`, 3 from `lg` and 4 from `2xl`, so four is the most cards a
 * shopper can see without scrolling the track. Warming more than the widest row
 * would prefetch cards nobody has looked at, which is the behaviour the budget
 * exists to remove.
 */
export const CAROUSEL_FIRST_ROW = 4;

/**
 * Deliberately NOT wrapped in a `<Suspense>`. Nothing beneath it suspends —
 * `Carousel` and `ProductCard` are state-and-effects client components — so a
 * boundary here was inert for streaming but not for the static shell: React
 * outlines any completed boundary over `progressiveChunkSize` (12 800 bytes)
 * into a `<div hidden id="S:…">` after the shell, and a carousel of cards is
 * past that budget, so every related / upsell / editorial carousel was hidden
 * with JavaScript off even when fully prerendered (measured on a Next 16.3
 * production build, 2026-09-10: the PDP's "Something similar" heading in the
 * shell, its tiles in `S:3`). See "Cached content renders OUTSIDE the
 * boundary" in `AGENTS.md`.
 */
const ProductCarousel = ({
  products,
  carouselItemClassName: _carouselItemClassName,
  id = "product-carousel",
  colourwayPins,
  prefetchCount = 0,
}: Props) => {
  // Carousels always show one colourway per product (never exploded variants).
  const items = collapseCatalogProducts(products, colourwayPins);

  return (
    <Carousel
      items={items}
      renderItem={(product, index) => (
        <ProductCard
          product={product}
          isNew={product.isNew}
          prefetch={index < prefetchCount ? true : undefined}
        />
      )}
      itemKey={(product) => product.id || product.slug}
      id={id}
      showPagination={false}
    />
  );
};

export { ProductCarousel };
