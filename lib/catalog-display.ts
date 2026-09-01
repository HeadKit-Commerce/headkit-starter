/**
 * Catalog display helpers — expand colourway cards and resolve branding prefs.
 */

import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { CATALOG_ROW_QUANTUM } from "@/components/headkit-ui/catalog-grid";
import { findSwatchAttribute } from "@/lib/swatch-attribute";
import { decodeHtmlEntities } from "@/lib/utils";

export interface CatalogDisplayPrefs {
  showVariants: boolean;
  showSwatches: boolean;
  imageRollover: boolean;
  /** Default PLP sort when URL has no ?sort=. SortKey string. */
  defaultCollectionSort: string;
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

function colourAttrSlug(product: ProductSummaryFieldsFragment): string | null {
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

  const fromDefault = defaultColourway(
    product as ProductWithDefaults,
    colourSlug,
  );
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
  // Colourway images[1] first. Parent hoverImage is the product gallery[1]
  // fallback when the variant has no own second frame (Shopify #393 leaves
  // variation.images empty for a single/shared featured). Never accept
  // another colourway's primary — that was the Insignia stolen-hover.
  const colourAttr = colourAttrSlug(product) ?? "";
  const otherPrimaries = new Set<string>();
  for (const variation of (product.variations ?? []) as VariationLike[]) {
    if (!variation) continue;
    if (variationColourValue(variation, colourAttr) === colourSlug) continue;
    const primary = variation.image?.src ?? "";
    if (primary) otherPrimaries.add(primary);
  }
  const colourwayHover = matchingVar?.images?.[1];
  const parentHover = product.hoverImage;
  // ProductSummaryFields.variations.images is src-only. The union with
  // parent hoverImage therefore has no alt/width/height — read those from
  // the parent object when it is the chosen candidate.
  const hoverCandidate =
    [colourwayHover, parentHover].find((img) => {
      const src = img?.src ?? "";
      return src !== "" && src !== imageSrc && !otherPrimaries.has(src);
    }) ?? null;
  const hoverSrc = hoverCandidate?.src ?? "";
  const parentMeta = parentHover?.src === hoverSrc ? parentHover : null;
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
            alt: decodeHtmlEntities(product.name ?? ""),
            width: 0,
            height: 0,
          }
        : null,
    hoverImage: hoverSrc
      ? {
          src: hoverSrc,
          alt: parentMeta?.alt ?? decodeHtmlEntities(product.name ?? ""),
          width: parentMeta?.width ?? 0,
          height: parentMeta?.height ?? 0,
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

/**
 * Keep only complete catalog rows while more pages can load.
 *
 * When colourways expand, card count is often not divisible by 2/3/4 — the
 * leftover cells read as blank cards above the load-more sentinel. Hold the
 * incomplete trailing quantum until the next page fills it, or until the
 * catalog is exhausted (`includeRemainder`).
 */
export function partitionFullRows<T>(
  items: ReadonlyArray<T>,
  options: { includeRemainder: boolean; quantum?: number },
): { visible: T[]; held: T[] } {
  const quantum =
    options.quantum && options.quantum > 0
      ? options.quantum
      : CATALOG_ROW_QUANTUM;
  const list = [...items];

  if (options.includeRemainder || list.length <= quantum) {
    return { visible: list, held: [] };
  }

  const fullCount = Math.floor(list.length / quantum) * quantum;
  if (fullCount === 0) {
    return { visible: list, held: [] };
  }

  return {
    visible: list.slice(0, fullCount),
    held: list.slice(fullCount),
  };
}
