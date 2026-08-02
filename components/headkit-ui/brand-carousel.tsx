"use client";

import Link from "next/link";
import Image from "next/image";
import { Carousel } from "@/components/headkit-ui/carousel";
import type { FeaturedBrand } from "@headkit/sdk";

interface Props {
  brands: Pick<FeaturedBrand, "name" | "slug" | "thumbnail">[];
}

const FALLBACK_IMAGE_SRC = "/assets/fallback-image.webp";

const BrandCarousel = ({ brands }: Props) => {
  return (
    <Carousel
      items={brands}
      renderItem={(item) => {
        const href = `/brand/${item?.slug ?? ""}`;
        const src =
          item?.thumbnail && item.thumbnail.trim() !== ""
            ? item.thumbnail
            : FALLBACK_IMAGE_SRC;

        return (
          <Link
            href={href}
            className="relative flex h-[50px] w-[160px] items-center justify-center"
            aria-label={item?.name}
          >
            {item?.thumbnail && item.thumbnail.trim() !== "" ? (
              <Image
                alt={item?.name ?? ""}
                src={src}
                fill
                className="object-contain object-center"
              />
            ) : (
              <span className="px-2 text-center text-sm font-semibold text-neutral-700 line-clamp-2">
                {item?.name}
              </span>
            )}
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
