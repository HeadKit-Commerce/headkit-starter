import parse, { Element, domToReact, type DOMNode } from "html-react-parser";
import type { Product } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { sanitizeContent } from "@/lib/sanitize-content";
import { EditorialProductGrid } from "@/components/headkit-ui/editorial-product-grid";
import { GravityForm } from "@/components/gravity-form-lazy";
import { scanProductCarouselsFromHtml } from "@/lib/scan-product-carousels-from-html";

interface Props {
  /** Untrusted WordPress `content.rendered` HTML (block-authored). */
  html: string;
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

/**
 * Shared render layer for editorial content (pages + news).
 *
 * Sanitizes untrusted WordPress block HTML through the opt-in editorial
 * allowlist (sanitizeContent — the R6 XSS boundary), then renders it as React
 * so that `woocommerce/handpicked-products` carousels can be swapped for the
 * storefront's ProductCarousel (matching the homepage HeadKit pattern) instead
 * of WordPress's static thumbnail markup.
 *
 * WordPress block CSS is loaded via dynamic `import()` of
 * `editorial-styles` only when there is HTML to render — so home routes that
 * only ship HeadKit React carousels never pay for ~153KB of unused
 * `.wp-block-*` rules. Never add that stylesheet to globals.css (D-04).
 */
export async function EditorialContent({
  html,
}: Props): Promise<React.JSX.Element> {
  if (!html.trim()) {
    return <></>;
  }

  // Pull WP block CSS into this route's graph only when we render WP HTML.
  await import("@/components/headkit-ui/editorial-styles");

  // Page Break (core/nextpage) renders as an HTML comment, which sanitize
  // strips. In a single-page headless view there is nothing to paginate, so
  // surface it as a visual divider before sanitizing.
  const preprocessed = html.replaceAll(
    "<!--nextpage-->",
    '<hr class="wp-block-nextpage-divider" />',
  );
  const clean = await sanitizeContent(preprocessed);
  const carousels = scanProductCarouselsFromHtml(clean);

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

  // Swap each handpicked-products node for ProductCarousel (matched by
  // document order), and convert the WP Accordion block — which needs WP's
  // Interactivity runtime we don't ship — into native <details>/<summary>.
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
        const colourwayPins: Record<string, string> = {};
        for (const product of products) {
          const pinned = carousel.colourwaysBySlug[product.slug];
          if (pinned) colourwayPins[product.id] = pinned;
        }
        return (
          <EditorialProductGrid
            products={products}
            colourwayPins={colourwayPins}
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
