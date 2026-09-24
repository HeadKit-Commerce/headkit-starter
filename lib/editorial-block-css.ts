/**
 * Which blocks actually put WordPress block HTML on a page — and therefore
 * which routes have to carry the vendored `wp-block-library` stylesheet.
 *
 * That stylesheet is 153,170 B (~17 KB brotli) and RENDER-BLOCKING wherever it
 * lands. `BlockEditor` has always gated it, and the gate has always LOOKED
 * like it worked, because commerce-only routes — `/shop`, `/collections/*`,
 * `/checkout` — do not carry it. They do not carry it because they do not
 * import `BlockEditor` or `EditorialContent` at all; see
 * `lib/editorial-stylesheet.ts` for why the runtime `if` could never have
 * decided anything.
 *
 * The second half of the defect is this predicate. The old gate asked "does
 * any block carry `html`?". `BlockEditor` renders most HeadKit blocks
 * STRUCTURALLY — a `headkit-product-carousel` block becomes React carousels,
 * and its raw WordPress `html` is only ever SCANNED for product slugs, never
 * emitted — but those blocks still carry that html in the payload, so every
 * one of them answered yes, and every commerce home page pulled the sheet in.
 *
 * `rendersEditorialHtml` mirrors `BlockEditor`'s render chain instead, IN ITS
 * ORDER: a block claimed by a structural branch never reaches
 * `SanitizedMediaHtml`, so it needs no stylesheet. Order is load-bearing — a
 * block carrying both a structural class and a media class renders
 * structurally, so the structural test has to come first.
 *
 * MEDIA blocks stay conservative on purpose. `headkit-embed` and
 * `headkit-gallery` reach `SanitizedMediaHtml` and emit whatever the
 * sanitizer returns, so they keep today's behaviour rather than being
 * second-guessed here.
 */

/** Blocks whose raw WordPress HTML is rendered (or may be, as a fallback). */
export const MEDIA_BLOCK_CLASSES = [
  "headkit-embed",
  "headkit-gallery",
  "headkit-video-feature",
] as const;

/**
 * Blocks `BlockEditor` renders as React components. Their `html` is never
 * emitted, so they must not pull the WordPress block stylesheet onto a route.
 *
 * Kept in sync with the render chain by the source assertion in
 * `editorial-block-css.test.ts`, not by hand.
 */
export const STRUCTURED_BLOCK_CLASSES = [
  "headkit-category-carousel",
  "headkit-hilight",
  "headkit-callout",
  "headkit-hero-carousel",
  "headkit-product-carousel",
  "headkit-brand-carousel",
  "headkit-client-carousel",
  "headkit-post-carousel",
  "headkit-project-carousel",
] as const;

/** The subset of a `ProcessedEditorBlock` this decision reads. */
export interface EditorialCssBlock {
  cssClasses: string[];
  html?: string | null | undefined;
}

/** True when this block reaches `BlockEditor`'s media / raw-HTML branch. */
export function isMediaBlock(cssClasses: string[]): boolean {
  return MEDIA_BLOCK_CLASSES.some((cls) => cssClasses.includes(cls));
}

/** True when this block's own WordPress HTML reaches the document. */
export function rendersEditorialHtml(block: EditorialCssBlock): boolean {
  // Structural first — it is what the render chain checks first.
  if (STRUCTURED_BLOCK_CLASSES.some((cls) => block.cssClasses.includes(cls))) {
    return false;
  }
  if (isMediaBlock(block.cssClasses)) return true;
  return Boolean(block.html?.trim());
}

/** True when this set of blocks needs the WordPress block stylesheet. */
export function needsEditorialCss(
  blocks: readonly EditorialCssBlock[] | null | undefined,
): boolean {
  return (blocks ?? []).some(rendersEditorialHtml);
}
