import Image from "next/image";
import Link from "next/link";
import type { BrandSummaryFieldsFragment } from "@headkit/sdk";

interface BrandCardProps {
  brand: BrandSummaryFieldsFragment;
}

export function BrandCard({ brand }: BrandCardProps) {
  return (
    <Link href={`/brand/${brand.slug}`}>
      <div className="group relative flex flex-col">
        <div className="aspect-3/2 w-full overflow-hidden flex justify-center items-center bg-white border border-gray-200 rounded-brand">
          {brand.image?.src ? (
            <div className="relative h-[50px] w-[160px]">
              <Image
                alt={brand.image.alt ?? brand.name}
                src={brand.image.src}
                fill
                className="object-contain object-center"
              />
            </div>
          ) : brand.thumbnail ? (
            <div className="relative h-[50px] w-[160px]">
              <Image
                alt={brand.name}
                src={brand.thumbnail}
                fill
                className="object-contain object-center"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-lg text-gray-500">{brand.name}</span>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col">
          <h3 className="text-[17px] font-semibold text-primary">
            {brand.name}
          </h3>
        </div>
      </div>
    </Link>
  );
}
