"use client";

import Link from "next/link";
import sanitize from "sanitize-html";
import { Carousel } from "@/components/headkit-ui/carousel";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  subcategories: ProductCategoryDetail[];
}

function plainDescription(html: string): string {
  const stripped = sanitize(html, { allowedTags: [], allowedAttributes: {} });
  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}

export function SubcategoryCarousel({ subcategories }: Props) {
  return (
    <div className="mt-8 pt-8">
      <Carousel
        items={subcategories}
        showControls={subcategories.length > 4}
        showScrollbar
        controlsPosition="top"
        gap="gap-[14px]"
        padding="px-4 md:px-10"
        // Mobile ~1.15 cards, sm 2, lg 4 columns (Figma: rect cards, desktop 4-up).
        itemSizing={{
          base: "w-[calc(85%-7px)]",
          sm: "sm:w-[calc(50%-7px)]",
          lg: "lg:w-[calc(25%-10.5px)]",
        }}
        renderItem={(child) => {
          const uri = child.uri || `/collections/${child.slug}`;
          const name = decodeHtmlEntities(child.name);
          const description = child.description
            ? plainDescription(child.description)
            : "";
          return (
            <Link href={uri} className="group block">
              <FeaturedImage
                src={child.thumbnail || null}
                alt={name}
                // Figma subcategory cards are landscape (~433×290 ≈ 3:2).
                className="aspect-[433/290] rounded-brand"
              />
              <h3 className="pt-3 text-[17px] font-semibold text-primary transition-opacity group-hover:opacity-80">
                {name}
              </h3>
              {description ? (
                <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                  {description}
                </p>
              ) : null}
            </Link>
          );
        }}
      />
    </div>
  );
}
