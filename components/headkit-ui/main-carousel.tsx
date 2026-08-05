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

type HeroSlide = HeroCarouselItem & {
  video?: string | null;
  mobileVideo?: string | null;
};

function slideVideo(slide: HeroSlide, mobile: boolean): string {
  if (mobile) {
    return slide.mobileVideo || slide.video || "";
  }
  return slide.video || "";
}

export const MainCarousel = ({ carouselItems }: Props) => {
  // Schedule windows are applied in WordPress (headkit_query_active_carousels).
  const items = carouselItems as HeroSlide[];

  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden mx-5">
      <Carousel
        items={items}
        renderItem={(carousel, index) => {
          const slide = carousel as HeroSlide;
          const HeaderTag: ElementType = index === 0 ? "h1" : "h2";
          const desktopVideo = slideVideo(slide, false);
          const mobileVideo = slideVideo(slide, true);
          const hasVideo = Boolean(desktopVideo || mobileVideo);

          return (
            <div className="basis-full w-full relative">
              <div className="relative flex flex-col-reverse overflow-hidden rounded-brand md:flex-col">
                <div className="z-10 h-full w-full md:absolute">
                  <div className="mx-auto flex h-full items-center">
                    <div className="py-[20px] md:w-[400px] md:pl-[20px] lg:w-[600px] lg:pl-[100px]">
                      <HeaderTag className="text-3xl font-semibold leading-[1.3]! text-primary md:text-5xl md:text-brand-bg!">
                        {decodeHtmlEntities(slide?.header ?? "")}
                      </HeaderTag>
                      <p className="mt-8 text-base font-semibold text-black md:text-3xl md:text-brand-bg!">
                        {decodeHtmlEntities(slide?.description ?? "")}
                      </p>
                      <div className="mt-8">
                        <Link href={slide?.url ?? "#"}>
                          <Button className="text-brand-bg">
                            {slide?.buttonText}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative h-[40vh] overflow-hidden md:h-[60vh] lg:h-[80vh]">
                  {hasVideo ? (
                    <>
                      {/* Mobile video (or desktop fallback). muted+playsInline
                          required for autoplay; poster keeps LCP image-like. */}
                      {mobileVideo || desktopVideo ? (
                        <video
                          className="h-full w-full object-cover md:hidden"
                          src={mobileVideo || desktopVideo}
                          poster={slide.mobileImage || slide.image || undefined}
                          autoPlay
                          muted
                          loop
                          playsInline
                          // Only preload metadata for non-first slides to limit
                          // bandwidth; first slide preloads enough to autoplay.
                          preload={index === 0 ? "auto" : "metadata"}
                        />
                      ) : null}
                      {desktopVideo ? (
                        <video
                          className="hidden h-full w-full object-cover md:block"
                          src={desktopVideo}
                          poster={slide.image || undefined}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload={index === 0 ? "auto" : "metadata"}
                        />
                      ) : null}
                      <div
                        aria-hidden
                        className="absolute inset-0 hidden md:block bg-gradient-to-r from-black/50 via-black/25 to-transparent"
                      />
                    </>
                  ) : slide?.image ? (
                    (() => {
                      const common = {
                        alt: slide.header,
                        sizes: "100vw",
                        width: 1920,
                        height: 1080,
                        quality: 75 as const,
                        priority: index === 0,
                      };
                      const {
                        props: { srcSet: desktopSrcSet, sizes: desktopSizes },
                      } = getImageProps({ ...common, src: slide.image });
                      const {
                        props: { srcSet: mobileSrcSet, ...mobileRest },
                      } = getImageProps({
                        ...common,
                        width: 768,
                        height: 960,
                        src: slide.mobileImage || slide.image,
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
                              alt={slide.header}
                              className="h-full w-full object-cover"
                              width={768}
                              height={960}
                            />
                          </picture>
                          <div
                            aria-hidden
                            className="absolute inset-0 hidden md:block bg-gradient-to-r from-black/50 via-black/25 to-transparent"
                          />
                        </>
                      );
                    })()
                  ) : null}
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
        showPagination={items.length > 1}
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
