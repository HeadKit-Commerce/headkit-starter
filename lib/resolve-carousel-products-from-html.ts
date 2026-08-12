import type { Product } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import {
  scanProductCarouselsFromHtml,
  type HtmlCarouselScan,
} from "@/lib/scan-product-carousels-from-html";

export type { HtmlCarouselScan };
export { scanProductCarouselsFromHtml };

export interface ResolvedCarouselProducts {
  products: Product[];
  /** Product ID → colourway slug (for ProductCarousel / collapseCatalogProducts). */
  colourwayPins: Record<string, string>;
}

/**
 * Resolve every product referenced by handpicked-products markup in `html`.
 * Preserves first-carousel document order when multiple lists are present.
 */
export async function resolveCarouselProductsFromHtml(
  html: string,
): Promise<ResolvedCarouselProducts> {
  const carousels = scanProductCarouselsFromHtml(html);
  if (carousels.length === 0) {
    return { products: [], colourwayPins: {} };
  }

  const orderedSlugs = carousels.flatMap((c) => c.slugs);
  const uniqueSlugs = [...new Set(orderedSlugs)];
  const resolved = await Promise.all(
    uniqueSlugs.map((slug) => headkit.products.get(slug).catch(() => null)),
  );
  const bySlug = new Map<string, Product>();
  uniqueSlugs.forEach((slug, i) => {
    const product = resolved[i];
    if (product) bySlug.set(slug, product as Product);
  });

  const products: Product[] = [];
  const seen = new Set<string>();
  for (const slug of orderedSlugs) {
    const product = bySlug.get(slug);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    products.push(product);
  }

  const colourwayPins: Record<string, string> = {};
  for (const carousel of carousels) {
    for (const product of products) {
      const pinned = carousel.colourwaysBySlug[product.slug];
      if (pinned && !colourwayPins[product.id]) {
        colourwayPins[product.id] = pinned;
      }
    }
  }

  return { products, colourwayPins };
}
