import { SubcategoryCard } from "@/components/headkit-ui/collection/subcategory-card";
import { SubcategoryCarouselClient } from "@/components/headkit-ui/collection/subcategory-carousel-client";
import type { ProductCategoryDetail } from "@headkit/sdk";

interface Props {
  subcategories: ProductCategoryDetail[];
  /** The parent collection's canonical path — see `SubcategoryCard`. */
  parentPath: string;
}

/**
 * Parent-category child carousel.
 *
 * The first card is rendered on the server (RSC → client slot) so its
 * `priority` image is in the initial HTML — client-only carousel markup was
 * delaying LCP discovery by ~3–4s on Slow 4G category PLPs.
 */
export function SubcategoryCarousel({
  subcategories,
  parentPath,
}: Props): React.JSX.Element {
  const first = subcategories[0];
  if (!first) {
    return <></>;
  }

  return (
    <div className="mt-8 pt-8">
      <SubcategoryCarouselClient
        subcategories={subcategories}
        parentPath={parentPath}
        firstCard={
          <SubcategoryCard
            subcategory={first}
            parentPath={parentPath}
            priority
          />
        }
      />
    </div>
  );
}
