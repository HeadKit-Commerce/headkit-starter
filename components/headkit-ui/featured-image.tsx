import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  /**
   * Mark this image as the likely LCP element (first-row grid cards). Emits a
   * preload + eager fetchPriority=high instead of the default lazy loading
   * (RC-2 perf fix — a lazy-loaded LCP image is discovered late and
   * deprioritized by the browser).
   */
  priority?: boolean;
  /** `contain` keeps full product shots visible (PLP cards); `cover` crops to fill. */
  fit?: "cover" | "contain";
}

const FALLBACK_IMAGE_SRC = "/assets/fallback-image.webp";

const FeaturedImage = ({
  src,
  alt = "",
  className,
  priority = false,
  fit = "cover",
}: Props) => {
  const imageSrc = src || FALLBACK_IMAGE_SRC;
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
        className={cn(
          "object-center",
          fit === "contain" ? "object-contain" : "object-cover",
        )}
        // Match product-grid breakpoints: 1 → 2 (≥480 → 3 ≥md → 4 ≥xl
        sizes="(max-width: 479px) 91vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
      />
    </div>
  );
};

export { FeaturedImage };
