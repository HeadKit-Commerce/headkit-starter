"use client";

import { Suspense } from "react";
import { Carousel } from "@/components/headkit-ui/carousel";
import { ProductCard } from "@/components/headkit-ui/product-card";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { useCatalogDisplay } from "@/components/headkit-ui/catalog-display-provider";
import { expandCatalogProducts } from "@/lib/catalog-display";

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
  const { showVariants } = useCatalogDisplay();
  const items = expandCatalogProducts(products, showVariants);

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
