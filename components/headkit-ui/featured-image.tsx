import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
}

const FeaturedImage = ({ src, alt = "", className }: Props) => {
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover object-center"
          sizes="(max-width: 640px) 91vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div className="h-full w-full bg-gray-200" />
      )}
    </div>
  );
};

export { FeaturedImage };
