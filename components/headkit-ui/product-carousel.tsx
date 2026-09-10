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
}

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
}: Props) => {
  // Carousels always show one colourway per product (never exploded variants).
  const items = collapseCatalogProducts(products, colourwayPins);

  return (
    <Carousel
      items={items}
      renderItem={(product) => (
        <ProductCard product={product} isNew={product.isNew} />
      )}
      itemKey={(product) => product.id || product.slug}
      id={id}
      showPagination={false}
    />
  );
};

export { ProductCarousel };
