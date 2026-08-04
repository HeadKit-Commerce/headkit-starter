"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { BadgeList } from "@/components/headkit-ui/badge-list";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Lightbox } from "@/components/ui/lightbox";

interface GalleryImage {
  src: string;
  alt: string;
}

interface Props {
  images: GalleryImage[];
  isSale?: boolean;
  isNew?: boolean;
}

const FALLBACK_IMAGE_SRC = "/assets/HeadKit-Fallback.png";
const SWIPE_THRESHOLD_PX = 40;

export function ProductImageGallery({
  images: rawImages,
  isSale = false,
  isNew = false,
}: Props) {
  const [mobileIndex, setMobileIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  // A product with no images still renders a placeholder rather than an
  // endless skeleton; downstream image src is always non-empty.
  const images: GalleryImage[] = rawImages?.length
    ? rawImages.filter((img) => img.src)
    : [];
  const galleryImages: GalleryImage[] = images.length
    ? images
    : [{ src: FALLBACK_IMAGE_SRC, alt: "No product image available" }];

  const goTo = useCallback(
    (index: number) => {
      const len = galleryImages.length;
      if (len === 0) return;
      setMobileIndex(((index % len) + len) % len);
    },
    [galleryImages.length],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchDeltaX.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const x = e.touches[0]?.clientX ?? touchStartX.current;
    touchDeltaX.current = x - touchStartX.current;
  };

  const onTouchEnd = () => {
    if (touchStartX.current === null) return;
    const delta = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (galleryImages.length <= 1) return;
    if (delta <= -SWIPE_THRESHOLD_PX) goTo(mobileIndex + 1);
    else if (delta >= SWIPE_THRESHOLD_PX) goTo(mobileIndex - 1);
  };

  return (
    <div>
      {/* Desktop: masonry-style two-column grid.
          RC-3 perf notes:
          - Non-first images are loading="lazy": lazy images inside this
            CSS-hidden (mobile) container never intersect the viewport, so a
            phone no longer downloads the whole desktop grid.
          - The first image shares the exact src/sizes/quality of the mobile
            carousel's first image, so its priority preload and network fetch
            dedupe with the mobile variant — one preload total.
          - quality is the default (75); q=100 doubled bytes for no visible
            gain on a 50vw render. */}
      <div className="hidden gap-5 md:grid md:grid-cols-2">
        {galleryImages.map((item, index) => (
          <Dialog key={index}>
            <DialogTrigger
              className={cn(
                "relative block w-full cursor-pointer appearance-none overflow-hidden rounded-brand border-0 bg-white p-0 text-left",
                index === 0 ? "col-span-2" : "col-span-1",
              )}
            >
              {index === 0 && (
                <div className="absolute left-2 top-2 z-10">
                  <BadgeList isSale={isSale} isNewIn={isNew} />
                </div>
              )}
              <div className="relative aspect-square overflow-hidden">
                <Image
                  src={item.src}
                  alt={item.alt || "Product image"}
                  fill
                  className={
                    index === 0
                      ? "object-contain object-center"
                      : "object-cover object-top"
                  }
                  sizes={
                    index === 0
                      ? "(min-width: 768px) 50vw, 100vw"
                      : "(min-width: 768px) 25vw, 100vw"
                  }
                  priority={index === 0}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  loading={index === 0 ? undefined : "lazy"}
                />
              </div>
            </DialogTrigger>
            <Lightbox images={galleryImages} initialSelectedIndex={index} />
          </Dialog>
        ))}
      </div>

      {/* Mobile: touch-swipe carousel (no arrow controls) */}
      <div
        className="relative block overflow-hidden rounded-brand bg-white md:hidden touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="absolute left-2 top-2 z-10">
          <BadgeList isSale={isSale} isNewIn={isNew} />
        </div>

        <Dialog>
          {/* `block p-0` kills UA button padding/baseline gap that otherwise
              shows as a white strip under cover slides on mobile Safari. */}
          <DialogTrigger className="block w-full appearance-none border-0 bg-transparent p-0 text-left">
            <div className="relative aspect-square overflow-hidden bg-white">
              {/* First image mirrors the desktop hero's sizes so the two
                  priority preloads/fetches dedupe into one (RC-3).
                  First slide contains; later slides cover from the top so
                  landscape lifestyle shots don't leave a bright floor band. */}
              <Image
                src={galleryImages[mobileIndex]?.src ?? FALLBACK_IMAGE_SRC}
                alt={galleryImages[mobileIndex]?.alt || "Product image"}
                fill
                className={
                  mobileIndex === 0
                    ? "object-contain object-center"
                    : "object-cover object-top"
                }
                sizes={
                  mobileIndex === 0 ? "(min-width: 768px) 50vw, 100vw" : "100vw"
                }
                priority={mobileIndex === 0}
                fetchPriority={mobileIndex === 0 ? "high" : "auto"}
                draggable={false}
              />
            </div>
          </DialogTrigger>
          <Lightbox images={galleryImages} initialSelectedIndex={mobileIndex} />
        </Dialog>

        {galleryImages.length > 1 && (
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2">
            {galleryImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMobileIndex(i)}
                aria-label={`Go to image ${i + 1}`}
                className="flex h-6 w-6 cursor-pointer items-center justify-center"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors",
                    i === mobileIndex
                      ? "bg-black/70"
                      : "bg-black/30 hover:bg-black/50",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
