"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icon";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  images: { src: string; alt: string }[];
  initialSelectedIndex: number;
}

const Lightbox = ({ images, initialSelectedIndex }: Props) => {
  const [currentIndex, setCurrentIndex] = useState(initialSelectedIndex);

  useEffect(() => {
    setCurrentIndex(initialSelectedIndex);
  }, [initialSelectedIndex]);

  const prev = () =>
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setCurrentIndex((i) => (i + 1) % images.length);

  const current = images[currentIndex];

  return (
    <DialogContent className="inset-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 left-0 top-0 items-center justify-center rounded-none border-0 bg-brand-bg p-0">
      <DialogTitle className="sr-only">Image preview</DialogTitle>
      <DialogDescription className="sr-only">
        Image {currentIndex + 1} of {images.length}
      </DialogDescription>

      <div className="relative flex h-full w-full items-center justify-center px-4 md:px-16">
        {current && (
          <div className="relative h-full w-full">
            <Image
              src={current.src}
              alt={current.alt}
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-primary/10 p-2 text-primary backdrop-blur-sm transition hover:bg-primary/20"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-primary/10 p-2 text-primary backdrop-blur-sm transition hover:bg-primary/20"
              aria-label="Next image"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-primary/70">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </DialogContent>
  );
};

export { Lightbox };
