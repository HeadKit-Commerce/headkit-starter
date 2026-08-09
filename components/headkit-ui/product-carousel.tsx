"use client";

import { Suspense } from "react";
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

const ProductCarousel = ({
  products,
  carouselItemClassName: _carouselItemClassName,
  id = "product-carousel",
  colourwayPins,
}: Props) => {
  // Carousels always show one colourway per product (never exploded variants).
  const items = collapseCatalogProducts(products, colourwayPins);

  return (
    <Suspense fallback={null}>
      <Carousel
        items={items}
        renderItem={(product) => (
          <ProductCard product={product} isNew={product.isNew} />
        )}
        itemKey={(product) => product.id || product.slug}
        id={id}
        showPagination={false}
      />
    </Suspense>
  );
};

export { ProductCarousel };
