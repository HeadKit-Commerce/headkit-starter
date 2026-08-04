"use client";

import { getImageProps } from "next/image";
import { ElementType } from "react";
import Link from "next/link";
import { Carousel } from "@/components/headkit-ui/carousel";
import { Button } from "@/components/ui/button";
import type { HeroCarouselItem } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  carouselItems: HeroCarouselItem[];
}

export const MainCarousel = ({ carouselItems }: Props) => {
  return (
    <div className="overflow-hidden mx-5">
      <Carousel
        items={carouselItems}
        renderItem={(carousel, index) => {
          const HeaderTag: ElementType = index === 0 ? "h1" : "h2";
          return (
            <div className="basis-full w-full relative">
              {/*
                Single brand-radius shell: previously nested rounded-2xl on a
                white parent + image child left a visible square background
                behind the image when cornerStyle was soft/round/square.
              */}
              <div className="relative flex flex-col-reverse overflow-hidden rounded-brand md:flex-col">
                <div className="z-10 h-full w-full md:absolute">
                  <div className="mx-auto flex h-full items-center">
                    <div className="py-[20px] md:w-[400px] md:pl-[20px] lg:w-[600px] lg:pl-[100px]">
                      {/* Mobile: title below image → brand primary.
                          Desktop: title overlays image → light (brand-bg /
                          page background). ! beats base h1/h2 { color: primary }. */}
                      <HeaderTag className="text-3xl font-semibold leading-[1.3]! text-primary md:text-5xl md:text-brand-bg!">
                        {decodeHtmlEntities(carousel?.header ?? "")}
                      </HeaderTag>
                      <p className="mt-8 text-base font-semibold text-black md:text-3xl md:text-brand-bg!">
                        {decodeHtmlEntities(carousel?.description ?? "")}
                      </p>
                      <div className="mt-8">
                        <Link href={carousel?.url ?? "#"}>
                          <Button className="text-brand-bg">
                            {carousel?.buttonText}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative h-[40vh] overflow-hidden md:h-[60vh] lg:h-[80vh]">
                  {carousel?.image
                    ? (() => {
                        // RC-4 perf fix: the previous two stacked <Image
                        // priority quality={100}> elements (md:hidden /
                        // hidden md:block) preloaded and downloaded BOTH hero
                        // variants on every viewport. One art-directed
                        // <picture> lets the browser pick exactly one source;
                        // only the first slide is eager/high-priority.
                        // Intrinsic dims guide the optimizer; CSS fills the
                        // hero box. quality 75 keeps AVIF/WebP lean vs 100.
                        const common = {
                          alt: carousel.header,
                          sizes: "100vw",
                          width: 1920,
                          height: 1080,
                          quality: 75 as const,
                          priority: index === 0,
                        };
                        const {
                          props: { srcSet: desktopSrcSet, sizes: desktopSizes },
                        } = getImageProps({ ...common, src: carousel.image });
                        const {
                          props: { srcSet: mobileSrcSet, ...mobileRest },
                        } = getImageProps({
                          ...common,
                          width: 768,
                          height: 960,
                          src: carousel.mobileImage || carousel.image,
                        });
                        return (
                          <>
                            <picture>
                              <source
                                media="(min-width: 768px)"
                                srcSet={desktopSrcSet}
                                sizes={desktopSizes}
                              />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                {...mobileRest}
                                srcSet={mobileSrcSet}
                                alt={carousel.header}
                                className="h-full w-full object-cover"
                                // Explicit dims avoid CLS; object-cover crops.
                                width={768}
                                height={960}
                              />
                            </picture>
                            {/* Contrast scrim (md:+ only, where text overlays
                                the image) so the brand-bg headline stays
                                legible on any customer image. Mobile renders
                                text below the image. */}
                            <div
                              aria-hidden
                              className="absolute inset-0 hidden md:block bg-gradient-to-r from-black/50 via-black/25 to-transparent"
                            />
                          </>
                        );
                      })()
                    : null}
                </div>
              </div>
            </div>
          );
        }}
        className="w-full"
        autoplay={{
          enabled: true,
          delay: 5000,
          stopOnInteraction: true,
        }}
        showScrollbar={false}
        showPagination={carouselItems.length > 1}
        paginationDotClassName="bg-white/50"
        paginationClassName="top-[calc(40vh-2rem)] md:top-auto md:bottom-6"
        useScrollSnap={true}
        itemSizing={{ base: "w-full" }}
        gap="gap-0"
        padding="px-0"
      />
    </div>
  );
};
