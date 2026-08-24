import sanitize from "sanitize-html";
import Image from "next/image";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";
import { SubcategoryCarousel } from "@/components/headkit-ui/collection/subcategory-carousel";

interface CollectionHeaderProps {
  name: string;
  description?: string;
  /**
   * Kept for callers / agent reference — not rendered on the storefront.
   * BreadcrumbList JSON-LD is emitted separately for bots.
   */
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
  thumbnail?: string;
  children?: ProductCategoryDetail[];
  /**
   * The path the subcategory cards link BENEATH — this collection's own
   * canonical path (`collectionPathFromCategory`) when the children are its
   * subcategories.
   *
   * A child category's payload carries no ancestors, so a card that knows only
   * its own slug can emit only the flat `/collections/{child}` shape, which the
   * collection route now 308s away from. The parent is where the ancestry is
   * known, so it hands it down.
   *
   * REQUIRED, and required for the same reason `SubcategoryCard.parentPath` is
   * — this is the prop that feeds it. A default would let a caller that renders
   * NESTED children omit it and emit the losing shape with no type error and no
   * test failure. A caller whose children are ROOT categories passes
   * `"/collections"` explicitly, because that IS the canonical base there.
   */
  childBasePath: string;
}

export function CollectionHeader({
  name,
  description,
  thumbnail,
  childBasePath,
  children: subcategories,
}: CollectionHeaderProps) {
  const decodedName = decodeHtmlEntities(name);
  const hasChildren = Boolean(subcategories && subcategories.length > 0);
  // Leaf subcategory: large featured image beside title (8/12 cols on desktop).
  // Aligns with PDP content inset (px-5 / md:px-10). Parent with children:
  // title + description only, then image-card carousel.
  const showLeafFeatured = !hasChildren && Boolean(thumbnail);

  return (
    <div className="overflow-x-clip">
      {showLeafFeatured ? (
        <div className="mb-5 grid grid-cols-1 gap-6 px-5 md:grid-cols-12 md:gap-8 md:px-10 md:pt-8">
          <div className="pt-5 md:col-span-4 md:pt-0">
            <h1 className="mb-[10px]">{decodedName}</h1>
            {description ? (
              <div
                className="text-base text-gray-800"
                dangerouslySetInnerHTML={{ __html: sanitize(description) }}
              />
            ) : null}
          </div>
          <div className="relative aspect-[915/458] w-full overflow-hidden bg-neutral-200 md:col-span-8 md:aspect-auto md:min-h-[320px] lg:min-h-[400px]">
            <Image
              alt=""
              src={thumbnail!}
              fill
              className="object-cover object-center"
              sizes="(max-width: 768px) 100vw, 66vw"
              priority
              fetchPriority="high"
              quality={75}
            />
          </div>
        </div>
      ) : (
        <div className="mb-5 px-5 pt-5 md:px-10">
          <h1 className="mb-[10px] mt-5">{decodedName}</h1>
          {description ? (
            <div
              className="max-w-2xl text-base text-gray-800"
              dangerouslySetInnerHTML={{ __html: sanitize(description) }}
            />
          ) : null}
        </div>
      )}
      {hasChildren && subcategories ? (
        <SubcategoryCarousel
          subcategories={subcategories}
          parentPath={childBasePath}
        />
      ) : null}
    </div>
  );
}
