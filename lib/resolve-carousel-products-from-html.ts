import type { Product } from "@headkit/sdk";
import { getCachedProduct } from "@/lib/product-cache";
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
 *
 * This is the FALLBACK for a carousel whose block was not hydrated
 * (`editorBlocks[].products` empty — an older theme, or a surface that never
 * threads its blocks through). Each slug goes through `getCachedProduct`, the
 * PDP's own cache entry (`TAG.product(slug)` + `TAG.products`, `days`), rather
 * than a bare `headkit.products.get`: the bare read cost one paced origin
 * request per product on EVERY request, which on a 24-product post serialised
 * into ~14 s behind commerce's 1.8 req/s origin bucket. Sharing the PDP entry
 * means a warm carousel costs no origin read and a product save purges the
 * card exactly as it purges the PDP.
 *
 * Tag propagation, considered deliberately (see `block-editor.tsx` on
 * `collectionPathIndex` and `lib/cache-tags.ts`): a `"use cache"` scope that
 * renders a carousel through this path inherits those product tags. Post and
 * CMS bodies render OUTSIDE any cached scope, so nothing there widens; the
 * only cached scope that can reach here is `HomeContent`, which already
 * subscribes to `TAG.collections` — a tag WordPress fires on a product-CATEGORY
 * term edit, never on a product save — so its blast radius does not grow
 * either.
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
    uniqueSlugs.map((slug) => getCachedProduct(slug).catch(() => null)),
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
