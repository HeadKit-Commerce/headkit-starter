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
 * @param dirty - untrusted HTML (WordPress block content)
 * @returns sanitized HTML safe to inject into the DOM
 */
export function sanitizeContent(dirty: string): string {
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
      a: ["href", "name", "target", "rel"],
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
        width: [/.*/],
        height: [/.*/],
        "max-width": [/.*/],
        "min-height": [/.*/],
        margin: [/.*/],
        "margin-top": [/.*/],
        "margin-right": [/.*/],
        "margin-bottom": [/.*/],
        "margin-left": [/.*/],
        padding: [/.*/],
        // WordPress's Dimensions panel emits individual side properties
        // (padding-top/right/bottom/left) — not the shorthand — so they must be
        // allowlisted for editor-set spacing to reach the storefront. Layout-only
        // props (no url()/expression()), so no XSS surface added.
        "padding-top": [/.*/],
        "padding-right": [/.*/],
        "padding-bottom": [/.*/],
        "padding-left": [/.*/],
        // blockGap on flex/grid layouts.
        gap: [/.*/],
        "row-gap": [/.*/],
        "column-gap": [/.*/],
        // Column widths (wp:column emits flex-basis:NN%).
        "flex-basis": [/.*/],
        "font-size": [/.*/],
      },
    },
    disallowedTagsMode: "discard",
  });
}
