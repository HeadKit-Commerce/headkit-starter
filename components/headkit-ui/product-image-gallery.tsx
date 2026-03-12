"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icon";
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

export function ProductImageGallery({
  images,
  isSale = false,
  isNew = false,
}: Props) {
  const [mobileIndex, setMobileIndex] = useState(0);

  const prevMobile = () =>
    setMobileIndex((i) => (i - 1 + images.length) % images.length);
  const nextMobile = () => setMobileIndex((i) => (i + 1) % images.length);

  return (
    <div>
      {/* Desktop: masonry-style two-column grid */}
      <div className="hidden gap-5 md:grid md:grid-cols-2">
        {images?.length ? (
          images.map((item, index) => (
            <Dialog key={index}>
              <DialogTrigger
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-[8px] bg-gray-200",
                  index === 0 ? "col-span-2" : "col-span-1",
                )}
              >
                {index === 0 && (
                  <div className="absolute left-2 top-2 z-10">
                    <BadgeList isSale={isSale} isNewIn={isNew} />
                  </div>
                )}
                <div className="relative aspect-square">
                  <Image
                    src={item.src}
                    alt={item.alt || "Product image"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    quality={100}
                    priority={index === 0}
                  />
                </div>
              </DialogTrigger>
              <Lightbox images={images} initialSelectedIndex={index} />
            </Dialog>
          ))
        ) : (
          <div className="col-span-2 aspect-square w-full animate-pulse rounded-[8px] bg-gray-200" />
        )}
      </div>

      {/* Mobile: simple arrow carousel */}
      <div className="relative block overflow-hidden rounded-lg border border-gray-200 md:hidden">
        <div className="absolute left-2 top-2 z-10">
          <BadgeList isSale={isSale} isNewIn={isNew} />
        </div>

        {images?.length ? (
          <>
            <Dialog>
              <DialogTrigger className="w-full">
                <div className="relative aspect-square bg-gray-100">
                  {images[mobileIndex]?.src && (
                    <Image
                      src={images[mobileIndex].src}
                      alt={images[mobileIndex].alt || "Product image"}
                      fill
                      className="object-cover object-center"
                      sizes="100vw"
                      priority={mobileIndex === 0}
                    />
                  )}
                </div>
              </DialogTrigger>
              <Lightbox images={images} initialSelectedIndex={mobileIndex} />
            </Dialog>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevMobile}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow transition hover:bg-white"
                  aria-label="Previous image"
                >
                  <ChevronLeftIcon className="h-5 w-5 text-gray-800" />
                </button>
                <button
                  type="button"
                  onClick={nextMobile}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow transition hover:bg-white"
                  aria-label="Next image"
                >
                  <ChevronRightIcon className="h-5 w-5 text-gray-800" />
                </button>

                {/* Pagination dots */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setMobileIndex(i)}
                      aria-label={`Go to image ${i + 1}`}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full transition-colors",
                        i === mobileIndex
                          ? "bg-black/70"
                          : "bg-black/30 hover:bg-black/50",
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="aspect-square w-full animate-pulse bg-gray-200" />
        )}
      </div>
    </div>
  );
}
