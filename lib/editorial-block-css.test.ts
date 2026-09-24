import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MEDIA_BLOCK_CLASSES,
  STRUCTURED_BLOCK_CLASSES,
  needsEditorialCss,
  rendersEditorialHtml,
} from "./editorial-block-css";

/**
 * The claim: a route pulls `wp-block-library.css` (153,170 B, ~17 KB brotli,
 * render-blocking) only when a block's own WordPress HTML actually reaches the
 * document.
 *
 * WHERE IT STOPS.
 *  - This is a pure predicate plus one SOURCE reading. It renders no block,
 *    builds nothing, and can see neither the emitted `<link>` tags nor a
 *    served document. That a commerce home page stops carrying the stylesheet
 *    is a BUILD claim, measured in the PR that introduced this by reading the
 *    stylesheet set of each prerendered route.
 *  - The source assertion reads `block-editor.tsx` as text. It catches a new
 *    structural branch keyed on a `headkit-*` class that nobody added to
 *    `STRUCTURED_BLOCK_CLASSES`; it cannot catch a branch keyed on something
 *    other than `data.cssClasses.includes("…")`.
 */

const carousel = (html: string) => ({
  cssClasses: ["headkit-product-carousel"],
  html,
});

describe("rendersEditorialHtml", () => {
  it("is false for a structural block, however much html it carries", () => {
    // The whole defect: the payload carries the WooCommerce markup a product
    // carousel was scanned from, and that markup is never emitted.
    expect(
      rendersEditorialHtml(
        carousel(
          '<div class="wp-block-woocommerce-handpicked-products">…</div>',
        ),
      ),
    ).toBe(false);
  });

  it("is false for a structural block that also carries a media class", () => {
    // Order matters: the render chain claims it structurally first.
    expect(
      rendersEditorialHtml({
        cssClasses: ["headkit-product-carousel", "headkit-gallery"],
        html: "<figure>…</figure>",
      }),
    ).toBe(false);
  });

  it("is true for a media block, even with no html to fall back on", () => {
    for (const cls of MEDIA_BLOCK_CLASSES) {
      expect(rendersEditorialHtml({ cssClasses: [cls] })).toBe(true);
    }
  });

  it("is true for an unclaimed block carrying html", () => {
    expect(
      rendersEditorialHtml({ cssClasses: [], html: "<p>Prose.</p>" }),
    ).toBe(true);
  });

  it("is false for an unclaimed block carrying only whitespace", () => {
    expect(rendersEditorialHtml({ cssClasses: [], html: "   \n" })).toBe(false);
    expect(rendersEditorialHtml({ cssClasses: [] })).toBe(false);
  });
});

describe("needsEditorialCss", () => {
  it("is false for a commerce-only home page", () => {
    expect(
      needsEditorialCss([
        { cssClasses: ["headkit-hero-carousel"], html: "<div>…</div>" },
        carousel("<ul class='products'>…</ul>"),
        { cssClasses: ["headkit-category-carousel"], html: "<div>…</div>" },
        { cssClasses: ["headkit-brand-carousel"], html: "<div>…</div>" },
      ]),
    ).toBe(false);
  });

  it("is true as soon as one block renders prose", () => {
    expect(
      needsEditorialCss([
        carousel("<ul class='products'>…</ul>"),
        { cssClasses: [], html: "<h2>About us</h2>" },
      ]),
    ).toBe(true);
  });

  it("is false for no blocks at all", () => {
    expect(needsEditorialCss([])).toBe(false);
    expect(needsEditorialCss(null)).toBe(false);
  });
});

describe("the class lists track the render chain", () => {
  it("names every headkit-* class block-editor.tsx branches on", () => {
    const source = readFileSync(
      join(__dirname, "..", "components", "headkit-ui", "block-editor.tsx"),
      "utf8",
    );
    const branched = new Set(
      [...source.matchAll(/cssClasses\.includes\("(headkit-[a-z-]+)"\)/g)].map(
        (match) => match[1] as string,
      ),
    );
    expect(branched.size).toBeGreaterThan(0);

    const known = new Set<string>([
      ...STRUCTURED_BLOCK_CLASSES,
      ...MEDIA_BLOCK_CLASSES,
    ]);
    const unclassified = [...branched].filter((cls) => !known.has(cls));
    expect(
      unclassified,
      "a new BlockEditor branch must be classified in editorial-block-css.ts, " +
        "or it will keep pulling wp-block-library.css onto its route",
    ).toEqual([]);
  });
});
