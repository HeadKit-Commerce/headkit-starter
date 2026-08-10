import Image from "next/image";
import { decodeHtmlEntities } from "@/lib/utils";

interface FeaturedImageHeaderProps {
  title: string;
  subtitle?: string;
  image?: string | null;
}

/**
 * Full-bleed hero for project (and similar) detail pages.
 * Matches {@link MainCarousel}: `mx-5`, `rounded-brand`, square media on
 * mobile / 16:9 (`aspect-video`) capped at 70svh on desktop, and hero title
 * 40px mobile / 48px desktop with Auto line-height.
 */
export function FeaturedImageHeader({
  title,
  subtitle,
  image,
}: FeaturedImageHeaderProps) {
  const decodedTitle = decodeHtmlEntities(title);
  return (
    <div className="mx-5 overflow-hidden">
      <div className="relative flex flex-col-reverse overflow-hidden rounded-brand md:flex-col">
        <div className="z-10 h-full w-full md:absolute">
          <div className="mx-auto flex h-full items-center">
            <div className="py-[20px] md:w-[400px] md:pl-[20px] lg:w-[600px] lg:pl-[100px]">
              <h1 className="text-[40px] leading-normal text-primary md:text-[48px] md:text-brand-bg!">
                {decodedTitle}
              </h1>
              {subtitle ? (
                <p className="mt-8 text-base font-semibold text-black md:text-3xl md:text-brand-bg!">
                  {decodeHtmlEntities(subtitle)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="relative aspect-square w-full overflow-hidden md:aspect-video md:max-h-[70svh]">
          <Image
            src={image || "/assets/images/bg-order-success.png"}
            alt={decodedTitle}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          <div
            aria-hidden
            className="absolute inset-0 hidden bg-gradient-to-r from-black/50 via-black/25 to-transparent md:block"
          />
        </div>
      </div>
    </div>
  );
}
