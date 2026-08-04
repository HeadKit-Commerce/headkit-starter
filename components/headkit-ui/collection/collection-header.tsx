import sanitize from "sanitize-html";
import Image from "next/image";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";
import { SubcategoryCarousel } from "@/components/headkit-ui/collection/subcategory-carousel";

interface CollectionHeaderProps {
  name: string;
  description?: string;
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
  thumbnail?: string;
  children?: ProductCategoryDetail[];
}

export function CollectionHeader({
  name,
  description,
  breadcrumbs,
  thumbnail,
  children: subcategories,
}: CollectionHeaderProps) {
  const decodedName = decodeHtmlEntities(name);
  const decodedBreadcrumbs = breadcrumbs?.map((b) => ({
    ...b,
    name: decodeHtmlEntities(b.name),
  }));
  const hasChildren = Boolean(subcategories && subcategories.length > 0);
  // Leaf subcategory: large featured image beside title (Figma 114:1292).
  // Parent with children: title + description only, then image-card carousel.
  const showLeafFeatured = !hasChildren && Boolean(thumbnail);

  return (
    <div className="overflow-x-clip">
      {showLeafFeatured ? (
        <div className="mb-5 grid grid-cols-1 gap-6 md:grid-cols-5 md:gap-8">
          <div className="px-4 pt-5 md:col-span-2 md:px-10 md:pt-8">
            {decodedBreadcrumbs && <Breadcrumb items={decodedBreadcrumbs} />}
            <h1 className="mb-[10px] mt-5 text-3xl font-bold md:text-4xl">
              {decodedName}
            </h1>
            {description ? (
              <div
                className="text-base text-gray-800"
                dangerouslySetInnerHTML={{ __html: sanitize(description) }}
              />
            ) : null}
          </div>
          <div className="relative aspect-[915/458] w-full overflow-hidden bg-neutral-200 md:col-span-3 md:aspect-auto md:min-h-[320px] lg:min-h-[400px]">
            <Image
              alt=""
              src={thumbnail!}
              fill
              className="object-cover object-center"
              sizes="(max-width: 768px) 100vw, 60vw"
              priority
              quality={75}
            />
          </div>
        </div>
      ) : (
        <div className="mb-5 px-4 pt-5 md:px-10">
          {decodedBreadcrumbs && <Breadcrumb items={decodedBreadcrumbs} />}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold md:text-4xl">
            {decodedName}
          </h1>
          {description ? (
            <div
              className="max-w-2xl text-base text-gray-800"
              dangerouslySetInnerHTML={{ __html: sanitize(description) }}
            />
          ) : null}
        </div>
      )}
      {hasChildren && subcategories ? (
        <SubcategoryCarousel subcategories={subcategories} />
      ) : null}
    </div>
  );
}
