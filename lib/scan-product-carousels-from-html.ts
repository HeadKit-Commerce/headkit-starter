/** One WordPress handpicked-products block: product slugs + colourway pins. */
export interface HtmlCarouselScan {
  slugs: string[];
  /** Product slug → colourway term slug from `data-colourway`. */
  colourwaysBySlug: Record<string, string>;
}

// The wrapper div for a `woocommerce/handpicked-products` block carries the
// `headkit-product-lists` class and wraps a single `<ul class="wc-block-grid__
// products">`. Capture the class attr and the inner markup up to that list's
// close so we can pull the product permalinks.
const CAROUSEL_RE =
  /<div[^>]*\bclass="([^"]*headkit-product-lists[^"]*)"[^>]*>([\s\S]*?)<\/ul>/gi;
const PRODUCT_ITEM_RE =
  /<li\b[^>]*\bwc-block-grid__product\b[^>]*>[\s\S]*?<\/li>/gi;
const PRODUCT_LINK_RE =
  /<a[^>]+href="([^"]+)"[^>]*class="[^"]*wc-block-grid__product-link|<a[^>]+class="[^"]*wc-block-grid__product-link[^"]*"[^>]*href="([^"]+)"/i;

/** WooCommerce product permalink → product slug (last non-empty path segment). */
function slugFromHref(href: string): string {
  try {
    const path = new URL(href).pathname;
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    const segments = href.split("?")[0]?.split("/").filter(Boolean) ?? [];
    return segments[segments.length - 1] ?? "";
  }
}

/** Scan HTML for handpicked-products blocks, in document order. */
export function scanProductCarouselsFromHtml(html: string): HtmlCarouselScan[] {
  const carousels: HtmlCarouselScan[] = [];
  for (const block of html.matchAll(CAROUSEL_RE)) {
    const inner = block[2] ?? "";
    const slugs: string[] = [];
    const colourwaysBySlug: Record<string, string> = {};
    for (const item of inner.matchAll(PRODUCT_ITEM_RE)) {
      const li = item[0] ?? "";
      const linkMatch = PRODUCT_LINK_RE.exec(li);
      const href = linkMatch?.[1] || linkMatch?.[2] || "";
      const slug = slugFromHref(href);
      if (!slug) continue;
      slugs.push(slug);
      const colourway = /data-colourway="([^"]+)"/i.exec(li)?.[1]?.trim();
      if (colourway) {
        colourwaysBySlug[slug] = colourway;
      }
    }
    // Fallback when list items are not present (older markup).
    if (slugs.length === 0) {
      for (const m of inner.matchAll(
        /href="([^"]+)"[^>]*class="[^"]*wc-block-grid__product-link/gi,
      )) {
        const slug = slugFromHref(m[1] ?? "");
        if (slug) slugs.push(slug);
      }
    }
    carousels.push({ slugs, colourwaysBySlug });
  }
  return carousels;
}
