"use client";

import Link from "next/link";
import Image from "next/image";
import { Carousel } from "@/components/headkit-ui/carousel";
import { decodeHtmlEntities } from "@/lib/utils";
import type { FeaturedBrand } from "@headkit/sdk";

interface Props {
  brands: Pick<FeaturedBrand, "name" | "slug" | "thumbnail">[];
}

const FALLBACK_IMAGE_SRC = "/assets/HeadKit-Fallback.png";

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
        const name = decodeHtmlEntities(item?.name ?? "");

        return (
          <Link
            href={href}
            className="relative flex h-[50px] w-[160px] items-center justify-center"
            aria-label={name}
          >
            {item?.thumbnail && item.thumbnail.trim() !== "" ? (
              <Image
                alt={name}
                src={src}
                fill
                quality={65}
                sizes="160px"
                className="object-contain object-center"
              />
            ) : (
              <span className="px-2 text-center text-sm font-semibold text-neutral-700 line-clamp-2">
                {name}
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
