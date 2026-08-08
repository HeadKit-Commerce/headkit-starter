"use client";

import { Suspense } from "react";
import { Carousel } from "@/components/headkit-ui/carousel";
import { ProductCard } from "@/components/headkit-ui/product-card";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

interface Props {
  products: ProductSummaryFieldsFragment[];
  carouselItemClassName?: string;
  id?: string;
}

const ProductCarousel = ({
  products,
  carouselItemClassName: _carouselItemClassName,
  id = "product-carousel",
}: Props) => {
  return (
    <Suspense fallback={null}>
      <Carousel
        items={products?.filter((x) => !!x?.slug) ?? []}
        renderItem={(product: ProductSummaryFieldsFragment) => (
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
