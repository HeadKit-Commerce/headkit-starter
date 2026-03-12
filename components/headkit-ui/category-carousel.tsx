"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import Link from "next/link";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import type { FeaturedCategory } from "@headkit/sdk";

interface Props {
  categories: Pick<FeaturedCategory, "name" | "slug" | "uri" | "thumbnail">[];
}

const CategoryCarousel = ({ categories }: Props) => {
  return (
    <Carousel
      items={categories}
      renderItem={(item) => (
        <Link href={item?.uri ?? `/shop/categories/${item?.slug}`}>
          <FeaturedImage src={item?.thumbnail} alt={item?.name} />
          <div className="pt-3 text-[17px] font-semibold">{item?.name}</div>
        </Link>
      )}
      className="w-full"
      showPagination={false}
    />
  );
};

export { CategoryCarousel };
