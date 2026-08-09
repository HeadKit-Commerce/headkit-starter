"use client";

import type { ReactNode } from "react";
import { Carousel } from "@/components/headkit-ui/carousel";
import { SubcategoryCard } from "@/components/headkit-ui/collection/subcategory-card";
import type { ProductCategoryDetail } from "@headkit/sdk";

interface Props {
  subcategories: ProductCategoryDetail[];
  /**
   * Server-rendered first card (with `priority` image). Passed as a slot so the
   * LCP `<img>` is in the initial HTML outside the client carousel bootstrap.
   */
  firstCard: ReactNode;
}

/**
 * Client carousel track. Index 0 uses the SSR `firstCard` slot; remaining
 * cards render on the client without competing for LCP.
 */
export function SubcategoryCarouselClient({
  subcategories,
  firstCard,
}: Props): React.JSX.Element {
  return (
    <Carousel
      items={subcategories}
      showControls={subcategories.length > 4}
      showScrollbar
      controlsPosition="top"
      gap="gap-[30px]"
      padding="px-5 md:px-10"
      // Mobile ~1.15 cards, sm 2, lg/xl 3, 2xl 4 columns; 30px gaps.
      itemSizing={{
        base: "w-[calc(85%-15px)]",
        sm: "sm:w-[calc(50%-15px)]",
        lg: "lg:w-[calc(33.333333%-20px)]",
        "2xl": "2xl:w-[calc(25%-22.5px)]",
      }}
      renderItem={(child, index) =>
        index === 0 ? firstCard : <SubcategoryCard subcategory={child} />
      }
    />
  );
}
