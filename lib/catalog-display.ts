/**
 * Catalog display helpers — expand colourway cards and resolve branding prefs.
 */

import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { findSwatchAttribute } from "@/lib/swatch-attribute";

export interface CatalogDisplayPrefs {
  showVariants: boolean;
  showSwatches: boolean;
  imageRollover: boolean;
}

/** Product card model with an optional locked colourway slug. */
export type CatalogProduct = ProductSummaryFieldsFragment & {
  /** When set, this card represents one colourway of the parent product. */
  colorwaySlug?: string | null;
  /**
   * Second gallery image for image-rollover. Present on list payloads when the
   * commerce API provides it; optional until SDK codegen includes the field.
   */
  hoverImage?: {
    src: string;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
};

/**
 * Expand variable products into one card per colourway when showVariants is on.
 * Colour/swatch attributes only — size-only products stay as a single card.
 */
export function expandCatalogProducts(
  products: ReadonlyArray<ProductSummaryFieldsFragment | null | undefined>,
  showVariants: boolean,
): CatalogProduct[] {
  const list = products.filter((p): p is ProductSummaryFieldsFragment =>
    Boolean(p?.slug),
  );

  if (!showVariants) {
    return list.map((p) => ({ ...p, colorwaySlug: null }));
  }

  const out: CatalogProduct[] = [];
  for (const product of list) {
    const colourAttr = findSwatchAttribute(product.attributes ?? []);
    const options = colourAttr?.fullOptions ?? [];
    if (!colourAttr || options.length === 0) {
      out.push({ ...product, colorwaySlug: null });
      continue;
    }

    for (const option of options) {
      const colourSlug = option?.slug ?? "";
      if (!colourSlug) continue;

      const matchingVar = (product.variations ?? []).find((variation) =>
        (variation.attributes ?? []).some((attr) => attr.value === colourSlug),
      );

      const imageSrc = matchingVar?.image?.src || product.image?.src || "";
      // Second variation gallery image for card rollover; fall back to parent.
      const hoverSrc =
        matchingVar?.images?.[1]?.src || product.hoverImage?.src || null;
      out.push({
        ...product,
        id: `${product.id}:${colourSlug}`,
        colorwaySlug: colourSlug,
        image: product.image
          ? {
              ...product.image,
              src: imageSrc || product.image.src,
            }
          : imageSrc
            ? {
                src: imageSrc,
                alt: product.name ?? "",
                width: 0,
                height: 0,
              }
            : null,
        hoverImage: hoverSrc
          ? {
              src: hoverSrc,
              alt: product.name ?? "",
              width: product.hoverImage?.width ?? 0,
              height: product.hoverImage?.height ?? 0,
            }
          : null,
      });
    }
  }
  return out;
}
