"use server";

import { productColourSlugs, productPath } from "@/lib/canonical-path";
import { getCachedProduct } from "@/lib/product-cache";
import type { WebMcpProductView } from "@/lib/webmcp";

const VARIATION_CAP = 24;

/**
 * The product an agent may see. Bounded variations, canonical path, no HTML
 * description, no add-ons, no identifiers beyond id and slug.
 *
 * `hidePrices` is the quote-mode decision the registrar already has. The
 * action drops prices before the result crosses back, so a quote store's
 * tool payload never carries them.
 */
export async function getWebMcpProduct(
  slug: string,
  options: { colourSlug?: string; hidePrices: boolean },
): Promise<WebMcpProductView | null> {
  let product: Awaited<ReturnType<typeof getCachedProduct>>;
  try {
    product = await getCachedProduct(slug);
  } catch {
    return null;
  }
  if (!product) return null;

  const colourSlugs = productColourSlugs(product);
  const colour = options.colourSlug;
  const unknownColour = !!colour && !colourSlugs.includes(colour);
  const path =
    !unknownColour && colour
      ? productPath(product, colour)
      : productPath(product);

  const variations: WebMcpProductView["variations"] = [];
  for (const variation of product.variations ?? []) {
    if (variations.length >= VARIATION_CAP) break;
    const attributes: Array<{ key: string; value: string }> = [];
    for (const attribute of variation.attributes ?? []) {
      if (!attribute?.key || !attribute.value) continue;
      attributes.push({ key: attribute.key, value: attribute.value });
    }
    const view: WebMcpProductView["variations"][number] = {
      id: variation.id,
      stockStatus: variation.stockStatus,
      attributes,
    };
    if (!options.hidePrices && variation.price) {
      view.price = variation.price;
    }
    variations.push(view);
  }

  const view: WebMcpProductView = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    path,
    stockStatus: product.stockStatus,
    variations,
    variationsTruncated: (product.variations?.length ?? 0) > VARIATION_CAP,
    unknownColour,
  };
  if (!options.hidePrices && product.price) {
    view.price = product.price;
  }
  return view;
}
