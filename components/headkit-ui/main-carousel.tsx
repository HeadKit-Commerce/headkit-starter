"use client";

import { getImageProps } from "next/image";
import { ElementType, useState } from "react";
import { AutoplayVideo } from "@/components/headkit-ui/autoplay-video";
import { Carousel } from "@/components/headkit-ui/carousel";
import { InstantLink } from "@/components/headkit-ui/instant-link";
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
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) return null;

  return (
    <div className="headkit-hero-carousel overflow-hidden mx-5">
      <Carousel
        items={items}
        onSlideChange={setActiveIndex}
        renderItem={(carousel, index) => {
          const slide = carousel as HeroSlide;
          const HeaderTag: ElementType = index === 0 ? "h1" : "h2";
          const desktopVideo = slideVideo(slide, false);
          const mobileVideo = slideVideo(slide, true);
          const hasVideo = Boolean(desktopVideo || mobileVideo);
          const isActive = index === activeIndex;

          return (
            <div className="basis-full w-full relative">
              <div className="relative flex flex-col-reverse overflow-hidden rounded-brand md:flex-col">
                <div className="z-10 h-full w-full md:absolute">
                  <div className="mx-auto flex h-full items-center">
                    <div className="py-[20px] md:w-[400px] md:pl-[20px] lg:w-[600px] lg:pl-[100px]">
                      <HeaderTag className="text-[40px] leading-normal text-primary md:text-[48px] md:text-brand-bg!">
                        {decodeHtmlEntities(slide?.header ?? "")}
                      </HeaderTag>
                      <p className="mt-8 text-base font-semibold text-black md:text-3xl md:text-brand-bg!">
                        {decodeHtmlEntities(slide?.description ?? "")}
                      </p>
                      <div className="mt-8">
                        <InstantLink href={slide?.url ?? "#"}>
                          <Button className="text-brand-bg">
                            {slide?.buttonText}
                          </Button>
                        </InstantLink>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Desktop: prefer 16:9; cap height so ultrawide never overflows
                    the fold (object-cover crops within the box). Mobile stays square. */}
                <div className="relative aspect-square w-full overflow-hidden md:aspect-video md:max-h-[70svh]">
                  {hasVideo ? (
                    <>
                      {/* Mobile video (or desktop fallback). muted+playsInline
                          required for autoplay; poster keeps LCP image-like. */}
                      {mobileVideo || desktopVideo ? (
                        <AutoplayVideo
                          className="h-full w-full object-cover md:hidden"
                          src={mobileVideo || desktopVideo}
                          {...(slide.mobileImage || slide.image
                            ? {
                                poster: slide.mobileImage || slide.image!,
                              }
                            : {})}
                          isActive={isActive}
                          preload={index === 0 ? "auto" : "metadata"}
                        />
                      ) : null}
                      {desktopVideo ? (
                        <AutoplayVideo
                          className="hidden h-full w-full object-cover md:block"
                          src={desktopVideo}
                          {...(slide.image ? { poster: slide.image } : {})}
                          isActive={isActive}
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
                      const isLcp = index === 0;
                      const desktop = {
                        alt: slide.header,
                        sizes: "100vw",
                        width: 1920,
                        height: 1080,
                        // Desktop can afford slightly higher quality; mobile LCP
                        // path stays leaner under Slow 4G (~65 vs 75).
                        quality: 75 as const,
                        priority: isLcp,
                        fetchPriority: (isLcp ? "high" : "auto") as
                          | "high"
                          | "auto",
                      };
                      const {
                        props: { srcSet: desktopSrcSet, sizes: desktopSizes },
                      } = getImageProps({ ...desktop, src: slide.image });
                      // Prefer a real mobile asset when CMS provides one; fall
                      // back to the desktop image at a smaller encode budget.
                      const mobileSrc = slide.mobileImage || slide.image;
                      const {
                        props: { srcSet: mobileSrcSet, ...mobileRest },
                      } = getImageProps({
                        alt: slide.header,
                        sizes: "100vw",
                        width: 768,
                        height: 768,
                        quality: 65 as const,
                        priority: isLcp,
                        fetchPriority: (isLcp ? "high" : "auto") as
                          | "high"
                          | "auto",
                        src: mobileSrc,
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
                              height={768}
                              fetchPriority={isLcp ? "high" : "auto"}
                              decoding={isLcp ? "sync" : "async"}
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
        loop={true}
        transition="fade"
        autoplay={{ enabled: true, delay: 5000, stopOnInteraction: true }}
        showScrollbar={false}
        showPagination={items.length > 1}
        paginationDotClassName="bg-white/50"
        paginationClassName="top-[calc(100vw-4.5rem)] md:top-auto md:bottom-6"
        itemSizing={{ base: "w-full" }}
        itemKey={(slide) => slide.id}
        gap="gap-0"
        padding="px-0"
      />
    </div>
  );
};
