import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  /**
   * Mark this image as the likely LCP element (first-row grid / carousel cards).
   * Emits a preload + eager fetchPriority=high instead of the default lazy
   * loading.
   */
  priority?: boolean;
  /** `contain` keeps full product shots visible (PLP cards); `cover` crops to fill. */
  fit?: "cover" | "contain";
  /**
   * Optimizer quality (must be listed in `next.config` images.qualities).
   * PLP/carousel default 65 balances visual quality vs bytes; heroes can pass 75.
   */
  quality?: 50 | 65 | 75 | 100;
}

/** Local fallback when a product/category has no thumbnail — never fetched from WP. */
const FALLBACK_IMAGE_SRC = "/assets/HeadKit-Fallback.png";

const FeaturedImage = ({
  src,
  alt = "",
  className,
  priority = false,
  fit = "cover",
  quality = 65,
}: Props) => {
  // Empty/whitespace means "no image" — use the storefront fallback asset only.
  const trimmed = src?.trim();
  const imageSrc = trimmed ? trimmed : FALLBACK_IMAGE_SRC;
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-brand",
        fit === "contain" ? "bg-white" : "bg-gray-100",
        className,
      )}
    >
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        quality={quality}
        className={cn(
          "object-center",
          fit === "contain" ? "object-contain" : "object-cover",
        )}
        // Match product-grid breakpoints: 1 → 2 ≥480 → 3 ≥md → 4 ≥xl
        sizes="(max-width: 479px) 91vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
      />
    </div>
  );
};

export { FeaturedImage };
