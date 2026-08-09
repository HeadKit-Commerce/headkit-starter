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
 * Admin-pinned colourway map: WooCommerce product ID → colourway term slug.
 * Populated from handpicked-products `productColourways` / `data-colourway`.
 */
export type ColourwayPins = Readonly<Record<string, string>>;

type VariationLike = NonNullable<
  ProductSummaryFieldsFragment["variations"]
>[number] & {
  dateModified?: string | null;
};

type ProductWithDefaults = ProductSummaryFieldsFragment & {
  defaultAttributes?: ReadonlyArray<{ key: string; value: string }> | null;
};

function colourAttrSlug(
  product: ProductSummaryFieldsFragment,
): string | null {
  return findSwatchAttribute(product.attributes ?? [])?.slug ?? null;
}

function variationColourValue(
  variation: VariationLike,
  colourSlug: string,
): string {
  for (const attr of variation.attributes ?? []) {
    if (!attr) continue;
    if (attr.key === colourSlug || attr.key === `attribute_${colourSlug}`) {
      return attr.value ?? "";
    }
  }
  return "";
}

function defaultColourway(
  product: ProductWithDefaults,
  colourSlug: string,
): string {
  for (const attr of product.defaultAttributes ?? []) {
    if (!attr) continue;
    if (attr.key === colourSlug || attr.key === `attribute_${colourSlug}`) {
      return attr.value ?? "";
    }
  }
  return "";
}

function latestModifiedColourway(
  product: ProductSummaryFieldsFragment,
  colourSlug: string,
): string {
  let bestSlug = "";
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const variation of (product.variations ?? []) as VariationLike[]) {
    if (!variation) continue;
    const colour = variationColourValue(variation, colourSlug);
    if (!colour) continue;
    const raw = variation.dateModified ?? "";
    const ts = raw ? Date.parse(raw) : Number.NEGATIVE_INFINITY;
    if (ts > bestTs || (ts === bestTs && !bestSlug)) {
      bestTs = ts;
      bestSlug = colour;
    }
  }
  return bestSlug;
}

function firstColourway(product: ProductSummaryFieldsFragment): string {
  const colourAttr = findSwatchAttribute(product.attributes ?? []);
  return colourAttr?.fullOptions?.[0]?.slug ?? "";
}

/**
 * Resolve which colourway a carousel/editorial card should show.
 * Order: admin pin → WooCommerce default → latest-updated variation → first option.
 */
export function resolveCarouselColourway(
  product: ProductSummaryFieldsFragment,
  pins?: ColourwayPins | null,
): string | null {
  const colourSlug = colourAttrSlug(product);
  if (!colourSlug) return null;

  const pin = pins?.[product.id]?.trim();
  if (pin) return pin;

  const fromDefault = defaultColourway(product as ProductWithDefaults, colourSlug);
  if (fromDefault) return fromDefault;

  const fromLatest = latestModifiedColourway(product, colourSlug);
  if (fromLatest) return fromLatest;

  const first = firstColourway(product);
  return first || null;
}

function cardForColourway(
  product: ProductSummaryFieldsFragment,
  colourSlug: string | null,
): CatalogProduct {
  if (!colourSlug) {
    return { ...product, colorwaySlug: null };
  }

  const matchingVar = ((product.variations ?? []) as VariationLike[]).find(
    (variation) =>
      variation &&
      variationColourValue(variation, colourAttrSlug(product) ?? "") ===
        colourSlug,
  );

  const imageSrc = matchingVar?.image?.src || product.image?.src || "";
  const hoverSrc =
    matchingVar?.images?.[1]?.src || product.hoverImage?.src || null;
  // Sale badge should match the colourway shown, not "any variation on sale".
  const onSale = matchingVar ? Boolean(matchingVar.onSale) : product.onSale;

  return {
    ...product,
    id: `${product.id}:${colourSlug}`,
    colorwaySlug: colourSlug,
    onSale,
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
  };
}

/**
 * One card per product for carousels / handpicked editorial grids.
 * Avoids repeating exploded colourways; prefers default or admin-pinned colour.
 */
export function collapseCatalogProducts(
  products: ReadonlyArray<ProductSummaryFieldsFragment | null | undefined>,
  pins?: ColourwayPins | null,
): CatalogProduct[] {
  const list = products.filter((p): p is ProductSummaryFieldsFragment =>
    Boolean(p?.slug),
  );

  return list.map((product) =>
    cardForColourway(product, resolveCarouselColourway(product, pins)),
  );
}

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
    // Collection/search “variants off”: still surface the default colourway image.
    return collapseCatalogProducts(list);
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
      out.push(cardForColourway(product, colourSlug));
    }
  }
  return out;
}
