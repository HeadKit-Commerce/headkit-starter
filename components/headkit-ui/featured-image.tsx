import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
}

const FALLBACK_IMAGE_SRC = "/assets/fallback-image.webp";

const FeaturedImage = ({ src, alt = "", className }: Props) => {
  const imageSrc = src || FALLBACK_IMAGE_SRC;
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100",
        className,
      )}
    >
      <Image
        src={imageSrc}
        alt={alt}
        fill
        className="object-cover object-center"
        sizes="(max-width: 640px) 91vw, (max-width: 1024px) 50vw, 33vw"
      />
    </div>
  );
};

export { FeaturedImage };
