import { cacheLife } from "next/cache";
import sanitizeHtml from "sanitize-html";

/**
 * Hostnames allowed as <iframe> sources (video embeds). Anything else is
 * dropped: a bare iframe allow is a clickjacking/XSS vector, so it is
 * constrained to https + this host allowlist with relative URLs disabled.
 */
const ALLOWED_IFRAME_HOSTS: readonly string[] = [
  "www.youtube.com",
  "youtube.com",
  "player.vimeo.com",
];

/**
 * Length values safe for editorial spacing / sizing.
 * Allows WP spacing presets, px/em/rem/%, auto/none/unset/0 — rejects vw/vh
 * so editor padding cannot break the starter full-bleed / padded column grid.
 * `unset` is required when WP pairs aspect-ratio with height/min-height:unset.
 */
const SAFE_CSS_LENGTH =
  /^(?:auto|none|unset|var\(--wp--preset--(?:spacing|font-size)--[a-z0-9-]+\)|-?\d*\.?\d+(?:px|em|rem|%)?|0)$/i;

/** Multi-value margin/padding/gap shorthands (1–4 SAFE_CSS_LENGTH tokens). */
const SAFE_CSS_LENGTH_LIST =
  /^(?:auto|none|unset|var\(--wp--preset--(?:spacing|font-size)--[a-z0-9-]+\)|-?\d*\.?\d+(?:px|em|rem|%)?|0)(?:\s+(?:auto|none|unset|var\(--wp--preset--(?:spacing|font-size)--[a-z0-9-]+\)|-?\d*\.?\d+(?:px|em|rem|%)?|0)){0,3}$/i;

/** Border width: length or thin/medium/thick. */
const SAFE_BORDER_WIDTH =
  /^(?:thin|medium|thick|0|-?\d*\.?\d+(?:px|em|rem|%)?)$/i;

/** Border style keywords only (no url()/expression()). */
const SAFE_BORDER_STYLE = /^(?:none|hidden|solid|dashed|dotted|double)$/i;

/**
 * CSS aspect-ratio values from WP Dimensions (Image/Cover).
 * Numeric (`1`, `16/9`, `16 / 9`), keywords, or a theme preset var.
 */
const SAFE_ASPECT_RATIO =
  /^(?:auto|unset|inherit|[\d.]+(?:\s*\/\s*[\d.]+)?|var\(--wp--preset--aspect-ratio--[a-z0-9-]+\))$/i;

/** object-fit keywords WP emits with cropped aspect-ratio images. */
const SAFE_OBJECT_FIT = /^(?:contain|cover|fill|none|scale-down)$/i;

/**
 * XSS allowlist for untrusted WordPress `content.rendered` HTML.
 *
 * OPT-IN, EDITORIAL ONLY: this util is the sanitize boundary applied by the
 * shared EditorialContent component before dangerouslySetInnerHTML. It is NOT
 * for the raw product-description injection (product-detail.tsx) — do not widen
 * that surface (SPEC constraint / T-08-03).
 *
 * It spreads the sanitize-html 2.17.1 defaults (which already ban <script>,
 * <style>, on* handler attributes, and javascript: URIs) and only widens the
 * minimum needed for block-faithful render: <img> + a constrained <iframe> tag,
 * class/id/style on the wildcard tag (for wp-block-* classes + block inline
 * styles), the img/a/iframe/table-cell attributes, and a property-restricted
 * inline-style allowlist. script, style, on-handlers, and javascript: URIs are
 * never added.
 *
 * Design controls (Tier 1):
 * - Layout width reaches the storefront via `.alignwide` / `.alignfull` classes
 *   (theme.json contentSize/wideSize match starter 45rem / 68rem).
 * - Spacing (padding/margin/gap) is allowlisted with px/em/rem/% only.
 * - Border width + style are allowlisted; border-color and border-radius are
 *   intentionally omitted — editorial CSS paints those from dashboard branding
 *   (`--color-primary`, `--radius`).
 * - Image/Cover aspect ratio (`aspect-ratio` + `object-fit`) is allowlisted so
 *   theme.json `dimensions.aspectRatio` reaches the storefront.
 *
 * Cached (`"use cache"`) so sanitize-html → postcss → nanoid's Math.random() is
 * stable under Cache Components prerender (same dirty input → same clean HTML).
 *
 * @param dirty - untrusted HTML (WordPress block content)
 * @returns sanitized HTML safe to inject into the DOM
 */
export async function sanitizeContent(dirty: string): Promise<string> {
  "use cache";
  // Deterministic for a given `dirty` string; max keeps prerender shells warm.
  cacheLife("max");

  return sanitizeHtml(dirty, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags, // includes figure/figcaption + table tags
      "img",
      "iframe",
      // Editorial blocks: Details (native <details>/<summary>), Quote/Pullquote
      // (<cite>), Page Break (rendered as <hr>). Accordion is converted to
      // <details> in EditorialContent, so it reuses details/summary too.
      "details",
      "summary",
      "cite",
      "hr",
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["class", "id", "style"], // wp-block-* classes + block inline styles
      // HeadKit GF markers: theme replaces [gravityform] with a div carrying
      // data-form-id so EditorialContent can hydrate the React GravityForm.
      div: ["class", "id", "style", "data-form-id", "data-headkit-gf"],
      // Handpicked colourway pin from HeadKit theme (carousel single-colourway).
      li: ["class", "id", "style", "data-colourway"],
      img: [
        "src",
        "srcset",
        "sizes",
        "alt",
        "title",
        "width",
        "height",
        "loading",
        "decoding",
      ],
      a: ["href", "name", "target", "rel", "data-colourway"],
      iframe: [
        "src",
        "width",
        "height",
        "allow",
        "allowfullscreen",
        "loading",
        "title",
        "frameborder",
      ],
      details: ["open"], // allow a block authored open-by-default
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
      colgroup: ["span"],
    },
    // Keep the default schemes (javascript: excluded). Constrain iframe to https
    // + the known embed hosts.
    allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
    allowedSchemesByTag: { iframe: ["https"] },
    allowedIframeHostnames: [...ALLOWED_IFRAME_HOSTS],
    allowIframeRelativeUrls: false,
    // Constrain inline style to a safe property allowlist (blocks
    // expression()/url() and CSS-exfiltration tricks).
    allowedStyles: {
      "*": {
        color: [/.*/],
        "background-color": [/.*/],
        // Group/Cover blocks with a background image emit
        // `background-image:url('http(s)://…')` (+ background-size/position).
        // url() is the one CSS value that carries an XSS/exfiltration surface,
        // so it is NOT opened up wholesale: only an http(s) url() or a CSS
        // gradient function is allowed — javascript:/data:/expression() and
        // bare tokens are rejected. background-size/position/repeat carry no
        // url(), so they are layout-only and safe.
        "background-image": [
          /^url\(\s*['"]?https?:\/\/[^"')]+['"]?\s*\)$/i,
          /^(?:repeating-)?(?:linear|radial|conic)-gradient\([^;]*\)$/i,
        ],
        "background-size": [/.*/],
        "background-position": [/.*/],
        "background-repeat": [/.*/],
        "text-align": [/^left$|^right$|^center$|^justify$/],
        // Sizing — length-only (no vw/vh) so columns stay on the starter grid.
        width: [SAFE_CSS_LENGTH],
        height: [SAFE_CSS_LENGTH],
        "max-width": [SAFE_CSS_LENGTH],
        "min-height": [SAFE_CSS_LENGTH],
        margin: [SAFE_CSS_LENGTH_LIST],
        "margin-top": [SAFE_CSS_LENGTH],
        "margin-right": [SAFE_CSS_LENGTH],
        "margin-bottom": [SAFE_CSS_LENGTH],
        "margin-left": [SAFE_CSS_LENGTH],
        padding: [SAFE_CSS_LENGTH_LIST],
        // WordPress's Dimensions panel emits individual side properties
        // (padding-top/right/bottom/left) — not the shorthand — so they must be
        // allowlisted for editor-set spacing to reach the storefront.
        "padding-top": [SAFE_CSS_LENGTH],
        "padding-right": [SAFE_CSS_LENGTH],
        "padding-bottom": [SAFE_CSS_LENGTH],
        "padding-left": [SAFE_CSS_LENGTH],
        // blockGap on flex/grid layouts.
        gap: [SAFE_CSS_LENGTH_LIST],
        "row-gap": [SAFE_CSS_LENGTH],
        "column-gap": [SAFE_CSS_LENGTH],
        // Column widths (wp:column emits flex-basis:NN%).
        "flex-basis": [SAFE_CSS_LENGTH],
        "font-size": [SAFE_CSS_LENGTH],
        // Border width + style only. Color and radius are NOT allowlisted —
        // storefront CSS applies dashboard `--color-primary` / `--radius`.
        "border-width": [SAFE_BORDER_WIDTH],
        "border-top-width": [SAFE_BORDER_WIDTH],
        "border-right-width": [SAFE_BORDER_WIDTH],
        "border-bottom-width": [SAFE_BORDER_WIDTH],
        "border-left-width": [SAFE_BORDER_WIDTH],
        "border-style": [SAFE_BORDER_STYLE],
        "border-top-style": [SAFE_BORDER_STYLE],
        "border-right-style": [SAFE_BORDER_STYLE],
        "border-bottom-style": [SAFE_BORDER_STYLE],
        "border-left-style": [SAFE_BORDER_STYLE],
        // Image/Cover Dimensions → Aspect ratio (theme.json dimensions.aspectRatio).
        "aspect-ratio": [SAFE_ASPECT_RATIO],
        "object-fit": [SAFE_OBJECT_FIT],
      },
    },
    disallowedTagsMode: "discard",
  });
}
