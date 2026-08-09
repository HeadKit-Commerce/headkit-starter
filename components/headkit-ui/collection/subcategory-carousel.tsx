import { SubcategoryCard } from "@/components/headkit-ui/collection/subcategory-card";
import { SubcategoryCarouselClient } from "@/components/headkit-ui/collection/subcategory-carousel-client";
import type { ProductCategoryDetail } from "@headkit/sdk";

interface Props {
  subcategories: ProductCategoryDetail[];
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
}: Props): React.JSX.Element {
  const first = subcategories[0];
  if (!first) {
    return <></>;
  }

  return (
    <div className="mt-8 pt-8">
      <SubcategoryCarouselClient
        subcategories={subcategories}
        firstCard={<SubcategoryCard subcategory={first} priority />}
      />
    </div>
  );
}
