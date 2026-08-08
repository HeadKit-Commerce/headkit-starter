"use client";

import sanitize from "sanitize-html";
import { Carousel } from "@/components/headkit-ui/carousel";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  subcategories: ProductCategoryDetail[];
}

function plainDescription(html: string): string {
  const stripped = sanitize(html, { allowedTags: [], allowedAttributes: {} });
  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}

/**
 * Parent-category child carousel. InstantLink + prefetch={true} warms each
 * collection PLP for Next.js 16.3 Instant Navigation / Partial Prefetching.
 */
export function SubcategoryCarousel({ subcategories }: Props) {
  return (
    <div className="mt-8 pt-8">
      <Carousel
        items={subcategories}
        showControls={subcategories.length > 4}
        showScrollbar
        controlsPosition="top"
        gap="gap-[30px]"
        padding="px-5 md:px-10"
        // Mobile ~1.15 cards, sm 2, lg 3, xl 4 columns; 30px gaps.
        itemSizing={{
          base: "w-[calc(85%-15px)]",
          sm: "sm:w-[calc(50%-15px)]",
          lg: "lg:w-[calc(33.333333%-20px)]",
          xl: "xl:w-[calc(25%-22.5px)]",
        }}
        renderItem={(child, index) => {
          // Always use the storefront catch-all route — WP `uri` can be an
          // absolute origin URL that would leave the Next.js app.
          const href = `/collections/${child.slug}`;
          const name = decodeHtmlEntities(child.name);
          const description = child.description
            ? plainDescription(child.description)
            : "";
          // First visible card is a likely LCP when thumbs exist on customer sites.
          const thumbnail = child.thumbnail?.trim() || null;
          return (
            <InstantLink
              href={href}
              pendingVariant="card"
              className="group block"
            >
              <FeaturedImage
                src={thumbnail}
                alt={name}
                priority={index === 0}
                // Figma subcategory cards are landscape (~433×290 ≈ 3:2).
                className="aspect-[433/290] rounded-brand"
              />
              <h3 className="pt-3 text-[17px] text-primary transition-opacity group-hover:opacity-80">
                {name}
              </h3>
              {description ? (
                <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                  {description}
                </p>
              ) : null}
            </InstantLink>
          );
        }}
      />
    </div>
  );
}
