"use client";

import Link from "next/link";
import Image from "next/image";
import { Carousel } from "@/components/headkit-ui/carousel";
import { decodeHtmlEntities } from "@/lib/utils";
import type { FeaturedBrand } from "@headkit/sdk";

interface Props {
  brands: Pick<FeaturedBrand, "name" | "slug" | "thumbnail">[];
}

/** Logo strip: only brands with a real logo (skips name-only top-brand fallbacks). */
function brandsWithLogos(
  brands: Props["brands"],
): Props["brands"] {
  return brands.filter(
    (b) => typeof b?.thumbnail === "string" && b.thumbnail.trim() !== "",
  );
}

const BrandCarousel = ({ brands }: Props) => {
  const logos = brandsWithLogos(brands);
  if (logos.length === 0) {
    return null;
  }

  return (
    <Carousel
      items={logos}
      // Fixed logo slots — default carousel columns (~33% wide) left huge gaps.
      gap="gap-3 md:gap-4"
      padding="px-5 md:px-10"
      itemSizing={{
        base: "w-[100px]",
        sm: "sm:w-[120px]",
        lg: "lg:w-[120px]",
      }}
      showControls={false}
      showScrollbar={false}
      renderItem={(item) => {
        const href = `/brand/${item?.slug ?? ""}`;
        const src = item.thumbnail.trim();
        const name = decodeHtmlEntities(item?.name ?? "");

        return (
          <Link
            href={href}
            className="relative flex h-[50px] w-full items-center justify-center"
            aria-label={name}
          >
            <Image
              alt={name}
              src={src}
              fill
              quality={65}
              sizes="120px"
              className="object-contain object-center"
            />
          </Link>
        );
      }}
      className="w-full"
      autoplay={{
        enabled: true,
        delay: 3000,
        stopOnInteraction: true,
      }}
      loop={true}
      showPagination={false}
    />
  );
};

export { BrandCarousel };
