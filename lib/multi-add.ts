import type { ProductVariation } from "@headkit/sdk";
import { isColorAttrSlug } from "@/components/headkit-ui/collection/utils";
import { getFloatVal } from "@/lib/utils";
import { isVariationOutOfStock } from "@/lib/variation-stock";

/** Minimal attribute shape shared by Product and RelatedProduct. */
export interface MultiAddAttribute {
  name: string;
  slug: string;
  variation: boolean;
}

/** Minimal related/companion product shape for multi-add. */
export interface MultiAddCompanion {
  id: string;
  name: string;
  slug: string;
  type: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  onSale: boolean;
  stockStatus: string;
  image?: { src: string; alt: string } | null;
  attributes: MultiAddAttribute[];
  defaultAttributes: Array<{ key: string; value: string }>;
  variations: ProductVariation[];
}

/**
 * Resolve the attribute slug to pin across companion rows.
 * Defaults to Colour/Color when the pin metafield is empty.
 */
export function resolvePinAttributeSlug(
  attributes: MultiAddAttribute[],
  pinOption: string | null | undefined,
): string | undefined {
  const pin = (pinOption ?? "Colour").trim().toLowerCase();
  if (!pin) return undefined;

  const match = attributes.find((a) => {
    if (!a.variation) return false;
    const name = a.name.toLowerCase();
    const slug = a.slug.toLowerCase();
    if (name === pin || slug === pin) return true;
    if (
      (pin === "colour" || pin === "color") &&
      isColorAttrSlug(a.slug)
    ) {
      return true;
    }
    return false;
  });
  return match?.slug;
}

/** Pin value from the hero's current selection (or default attributes). */
export function resolvePinValue(
  pinSlug: string | undefined,
  selectedAttributes: Record<string, string>,
  defaultAttributes: Array<{ key: string; value: string }>,
): string | undefined {
  if (!pinSlug) return undefined;
  const selected = selectedAttributes[pinSlug];
  if (selected) return selected;
  return defaultAttributes.find((a) => a.key === pinSlug)?.value;
}

/**
 * Pick the companion catalogue id to add: matching pinned variation when
 * variable, otherwise the product id. Returns null when no sellable match.
 */
export function resolveCompanionLineId(
  companion: MultiAddCompanion,
  pinSlug: string | undefined,
  pinValue: string | undefined,
): { id: string; unitPrice: number } | null {
  const variations = companion.variations ?? [];
  if (variations.length === 0) {
    if ((companion.stockStatus ?? "").toLowerCase() === "outofstock") {
      return null;
    }
    return {
      id: companion.id,
      unitPrice: getFloatVal(companion.price || companion.regularPrice),
    };
  }

  if (pinSlug && pinValue) {
    const match = variations.find((v) =>
      v.attributes.some((a) => a.key === pinSlug && a.value === pinValue),
    );
    if (match && !isVariationOutOfStock(match)) {
      return {
        id: match.id,
        unitPrice: getFloatVal(
          match.price || match.salePrice || match.regularPrice,
        ),
      };
    }
    return null;
  }

  const available = variations.find((v) => !isVariationOutOfStock(v));
  if (!available) return null;
  return {
    id: available.id,
    unitPrice: getFloatVal(
      available.price || available.salePrice || available.regularPrice,
    ),
  };
}
