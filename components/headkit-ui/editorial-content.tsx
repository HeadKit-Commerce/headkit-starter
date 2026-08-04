import "./../../app/_editorial/wp-block-library.css";
import parse, { Element, domToReact, type DOMNode } from "html-react-parser";
import type { Product } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { sanitizeContent } from "@/lib/sanitize-content";
import { EditorialProductGrid } from "@/components/headkit-ui/editorial-product-grid";
import { GravityForm } from "@/components/gravity-form-lazy";

interface Props {
  /** Untrusted WordPress `content.rendered` HTML (block-authored). */
  html: string;
}

/** One WordPress handpicked-products block: its product slugs, in order, plus
 *  the column count WP recorded (`has-N-columns`). */
interface Carousel {
  slugs: string[];
  columns: number;
}

// The wrapper div for a `woocommerce/handpicked-products` block carries the
// `headkit-product-lists` class and wraps a single `<ul class="wc-block-grid__
// products">`. Capture the class attr (for the column count) and the inner
// markup up to that list's close so we can pull the product permalinks.
const CAROUSEL_RE =
  /<div[^>]*\bclass="([^"]*headkit-product-lists[^"]*)"[^>]*>([\s\S]*?)<\/ul>/gi;
const PRODUCT_LINK_RE =
  /<a[^>]+href="([^"]+)"[^>]*class="[^"]*wc-block-grid__product-link/gi;

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

/** True if `node` is an Element carrying `cls` as a whole class token. */
function hasClass(node: DOMNode, cls: string): node is Element {
  return (
    node instanceof Element &&
    typeof node.attribs?.class === "string" &&
    node.attribs.class.split(/\s+/).includes(cls)
  );
}

/** Collect all descendant Elements (and self) carrying class token `cls`. */
function findAll(node: DOMNode, cls: string, out: Element[] = []): Element[] {
  if (hasClass(node, cls)) out.push(node);
  if (node instanceof Element) {
    for (const child of node.children as DOMNode[]) findAll(child, cls, out);
  }
  return out;
}

/** First descendant Element carrying class token `cls`, or null. */
function findFirst(node: DOMNode, cls: string): Element | null {
  return findAll(node, cls)[0] ?? null;
}

/** Concatenated text content of a node subtree. */
function textOf(node: DOMNode): string {
  if (node.type === "text") return (node as unknown as { data: string }).data;
  if (node instanceof Element) {
    return (node.children as DOMNode[]).map(textOf).join("");
  }
  return "";
}

/** Scan sanitized HTML for handpicked-products blocks, in document order. */
function scanCarousels(html: string): Carousel[] {
  const carousels: Carousel[] = [];
  for (const block of html.matchAll(CAROUSEL_RE)) {
    const classAttr = block[1] ?? "";
    const inner = block[2] ?? "";
    const columns = Number(/has-(\d+)-columns/.exec(classAttr)?.[1]) || 3;
    const slugs = [...inner.matchAll(PRODUCT_LINK_RE)]
      .map((m) => slugFromHref(m[1] ?? ""))
      .filter(Boolean);
    carousels.push({ slugs, columns });
  }
  return carousels;
}

/**
 * Shared render layer for editorial content (pages + news).
 *
 * Sanitizes untrusted WordPress block HTML through the opt-in editorial
 * allowlist (sanitizeContent — the R6 XSS boundary), then renders it as React
 * so that `woocommerce/handpicked-products` carousels can be swapped for the
 * storefront's own ProductCard grid (matching the home page: real PDP links,
 * next/image, live prices, sale badges, swatches) instead of WordPress's static
 * thumbnail markup. Product slugs are read from the block's permalinks and
 * resolved to full Product objects via the SDK; everything else renders as-is.
 *
 * The relative import of the vendored, version-pinned `wp-block-library.css`
 * keeps the WordPress core block styles scoped to editorial routes only (D-04) —
 * never add that stylesheet to globals.css, which would ship it on every route.
 *
 * Consumed by every editorial page (08-06 pages, 08-07 news) so the sanitize
 * boundary and block-CSS fidelity live in exactly one place.
 */
export async function EditorialContent({
  html,
}: Props): Promise<React.JSX.Element> {
  // Page Break (core/nextpage) renders as an HTML comment, which sanitize
  // strips. In a single-page headless view there is nothing to paginate, so
  // surface it as a visual divider before sanitizing.
  const preprocessed = html.replaceAll(
    "<!--nextpage-->",
    '<hr class="wp-block-nextpage-divider" />',
  );
  const clean = sanitizeContent(preprocessed);
  const carousels = scanCarousels(clean);

  // Resolve every referenced product once (slugs can repeat across carousels).
  const uniqueSlugs = [...new Set(carousels.flatMap((c) => c.slugs))];
  const resolved = await Promise.all(
    uniqueSlugs.map((slug) => headkit.products.get(slug).catch(() => null)),
  );
  const bySlug = new Map<string, Product>();
  uniqueSlugs.forEach((slug, i) => {
    const product = resolved[i];
    if (product) bySlug.set(slug, product as Product);
  });

  // Swap each handpicked-products node for the real ProductCard grid (matched by
  // document order), and convert the WP Accordion block — which needs WP's
  // Interactivity runtime we don't ship — into native <details>/<summary> so it
  // toggles with zero JS.
  let carouselIndex = 0;
  const options: Parameters<typeof parse>[1] = {
    replace: (domNode: DOMNode) => {
      if (
        domNode instanceof Element &&
        typeof domNode.attribs?.class === "string" &&
        domNode.attribs.class.includes("headkit-product-lists")
      ) {
        const carousel = carousels[carouselIndex++];
        if (!carousel) return <></>;
        const products = carousel.slugs
          .map((slug) => bySlug.get(slug))
          .filter((p): p is Product => Boolean(p));
        return (
          <EditorialProductGrid
            products={products}
            columns={carousel.columns}
          />
        );
      }

      // Gravity Forms marker (theme shortcode/block → headless hydrate).
      if (hasClass(domNode, "headkit-gravity-form")) {
        const formId = domNode.attribs?.["data-form-id"];
        if (!formId) return <></>;
        return <GravityForm formId={formId} />;
      }

      // WP Accordion → native <details>. Each accordion-item becomes one
      // <details>: its heading text is the <summary>, its panel content the body.
      if (hasClass(domNode, "wp-block-accordion")) {
        const items = findAll(domNode, "wp-block-accordion-item");
        return (
          <div className="hk-accordion">
            {items.map((item, i) => {
              const titleNode =
                findFirst(item, "wp-block-accordion-heading__toggle-title") ??
                findFirst(item, "wp-block-accordion-heading");
              const panel = findFirst(item, "wp-block-accordion-panel");
              return (
                <details className="hk-accordion__item" key={i}>
                  <summary className="hk-accordion__summary">
                    {titleNode ? textOf(titleNode).trim() : `Section ${i + 1}`}
                  </summary>
                  <div className="hk-accordion__panel">
                    {panel
                      ? domToReact(panel.children as DOMNode[], options)
                      : null}
                  </div>
                </details>
              );
            })}
          </div>
        );
      }

      return undefined;
    },
  };
  const parsed = parse(clean, options);

  return <div className="wp-block-content prose max-w-none">{parsed}</div>;
}
