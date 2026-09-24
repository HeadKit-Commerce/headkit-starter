/**
 * Shopify Files videos (Content → Files) are direct CDN URLs, not YouTube or
 * Vimeo players. Pages, posts, and product descriptions turn those URLs into
 * a native `<video>` so every Shopify store can play files it already hosts.
 */

const SHOPIFY_VIDEO_HOSTS = new Set(["cdn.shopify.com", "cdn.shopifycdn.net"]);

const VIDEO_EXT = "(?:mp4|webm|mov|m4v|ogv)";

/** A Shopify CDN URL whose path ends in a video file (optional query). */
const SHOPIFY_VIDEO_URL = new RegExp(
  `https://${SHOPIFY_VIDEO_HOSTS.size ? "(?:cdn\\.shopify\\.com|cdn\\.shopifycdn\\.net)" : ""}/[^\\s"'<>]+\\.${VIDEO_EXT}(?:\\?[^\\s"'<>]*)?`,
  "i",
);

const IFRAME_RE = new RegExp(
  `<iframe\\b[^>]*\\bsrc=["'](${SHOPIFY_VIDEO_URL.source})["'][^>]*>\\s*</iframe>`,
  "gi",
);

const ANCHOR_RE = new RegExp(
  `<a\\b[^>]*\\bhref=["'](${SHOPIFY_VIDEO_URL.source})["'][^>]*>[\\s\\S]*?</a>`,
  "gi",
);

/** Bare URL in text, not already inside an attribute (`"` or `'` precedes src). */
const BARE_RE = new RegExp(
  `(^|[\\s>])(${SHOPIFY_VIDEO_URL.source})(?=$|[\\s<])`,
  "gi",
);

/** True when `value` is an https Shopify CDN video file URL. */
export function isShopifyFileVideoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!SHOPIFY_VIDEO_HOSTS.has(url.hostname)) return false;
  return new RegExp(`\\.${VIDEO_EXT}$`, "i").test(url.pathname);
}

function videoTag(url: string): string {
  return `<video src="${url}" controls playsinline preload="metadata"></video>`;
}

/**
 * Turn Shopify file links the editor saved (iframe, anchor, or a pasted URL)
 * into a `<video>` element. YouTube and Vimeo markup is left alone.
 */
export function rewriteShopifyFileVideos(html: string): string {
  return html
    .replace(IFRAME_RE, (_match, url: string) => videoTag(url))
    .replace(ANCHOR_RE, (_match, url: string) => videoTag(url))
    .replace(
      BARE_RE,
      (_match, lead: string, url: string) => `${lead}${videoTag(url)}`,
    );
}
