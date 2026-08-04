"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { decodeHtmlEntities } from "@/lib/utils";
import type { FeaturedCategory } from "@headkit/sdk";

interface Props {
  categories: Pick<FeaturedCategory, "name" | "slug" | "uri" | "thumbnail">[];
}

/**
 * Homepage / editor "Shop by Category" carousel.
 * Prefetch={true} (via InstantLink) so Partial Prefetching can warm each
 * collection PLP before click (Next.js 16.3 Instant Navigation).
 */
const CategoryCarousel = ({ categories }: Props) => {
  return (
    <Carousel
      items={categories}
      renderItem={(item, index) => {
        // Prefer slug → storefront route. Raw WP `uri` may be absolute and
        // would navigate off the Next.js app (see e2e wishlist observation).
        const href = item?.slug
          ? `/collections/${item.slug}`
          : (item?.uri ?? "/shop");
        const thumbnail = item?.thumbnail?.trim() || null;
        const name = decodeHtmlEntities(item?.name ?? "");
        return (
          <InstantLink
            href={href}
            pendingVariant="card"
            className="group block"
          >
            <FeaturedImage src={thumbnail} alt={name} priority={index === 0} />
            <h3 className="pt-3 text-[17px] font-semibold text-primary">
              {name}
            </h3>
          </InstantLink>
        );
      }}
      className="w-full"
      showPagination={false}
    />
  );
};

export { CategoryCarousel };
