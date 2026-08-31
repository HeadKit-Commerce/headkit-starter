/**
 * Convert a WordPress / Shopify storefront absolute URI to a relative frontend
 * path.
 *
 * WooCommerce returns `uri` as a full absolute URL pointing to the WordPress
 * backend (e.g. "https://commerce-backend.com/shop/general/beanie/").
 * Next.js <Link href> must receive a relative path so navigation stays within
 * the Next.js frontend rather than redirecting to the WP origin.
 *
 * Custom Link menu items may use non-http schemes (`tel:`, `mailto:`, `sms:`).
 * Those must pass through unchanged — `new URL(uri).pathname` drops the scheme
 * (e.g. `tel:1300883919` → `1300883919`), which broke Paralel's preheader phone.
 *
 * Off-site http(s) hosts (Instagram, Facebook, …) must also pass through
 * unchanged. Stripping them to a bare path made InstantLink treat social links
 * as in-app routes (e.g. `instagram.com/brand` → `/brand`).
 *
 * @example
 * convertToRelativePath("https://commerce-backend.com/shop/general/beanie/")
 * // → "/shop/general/beanie/"
 *
 * convertToRelativePath("/shop/product/")
 * // → "/shop/product/"
 *
 * convertToRelativePath("tel:1300883919")
 * // → "tel:1300883919"
 *
 * convertToRelativePath("https://www.instagram.com/velvetmuse/")
 * // → "https://www.instagram.com/velvetmuse/"
 */
/**
 * Normalize a CMS/menu/carousel href for in-app Next.js navigation.
 * Same as {@link convertToRelativePath} — alias for call sites that gate on
 * {@link isAppNavigationHref} before rendering `InstantLink`.
 */
export function normalizeNavigationHref(
  uri: string | null | undefined,
): string {
  return convertToRelativePath(uri);
}

/** Hosts that must stay absolute (social / off-site Custom Links). */
const EXTERNAL_LINK_HOST_SUFFIXES = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "pinterest.com",
  "pin.it",
  "threads.net",
  "wa.me",
  "whatsapp.com",
  "vimeo.com",
  "spotify.com",
  "open.spotify.com",
] as const;

export function isExternalHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return EXTERNAL_LINK_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Shopify Catalog / "All Collections" is `/collections`; the automatic "All
 * products" collection is `/collections/all`. HeadKit's full catalog is `/shop`
 * (same as Woo). Bare `/collections` has no App Router index — it soft-404s via
 * `[...slug]`. Category PLPs (`/collections/{slug}`) are unchanged.
 */
function rewriteShopCatalogIndexPath(path: string): string {
  let cut = path.length;
  const q = path.indexOf("?");
  const h = path.indexOf("#");
  if (q >= 0) cut = Math.min(cut, q);
  if (h >= 0) cut = Math.min(cut, h);
  const pathname = path.slice(0, cut);
  const suffix = path.slice(cut);
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (
    normalized === "/collections" ||
    normalized.toLowerCase() === "/collections/all"
  ) {
    return `/shop${suffix}`;
  }
  return path;
}

export function convertToRelativePath(uri: string | null | undefined): string {
  if (!uri) return "";
  if (uri.startsWith("/")) return rewriteShopCatalogIndexPath(uri);

  // Opaque / non-http(s) schemes used by WP Custom Links — keep intact.
  // Match "scheme:" where scheme is not http/https (case-insensitive).
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(uri);
  if (schemeMatch) {
    const scheme = schemeMatch[1]?.toLowerCase() ?? "";
    if (scheme !== "http" && scheme !== "https") {
      return uri;
    }
  }

  try {
    const parsed = new URL(uri);
    if (isExternalHttpHost(parsed.hostname)) {
      return uri;
    }
    const pathWithSearch = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return rewriteShopCatalogIndexPath(pathWithSearch);
  } catch {
    return uri;
  }
}

/**
 * True when `href` is an in-app path suitable for Next.js `<Link>` prefetch.
 * Special schemes (`tel:`, `mailto:`, …), absolute http(s) URLs, and bare
 * fragments (`#`, `#section`) are not.
 *
 * Callers also use it as the "navigates anywhere in-app" gate, not only as a
 * prefetch hint: NavigationBar renders a dropdown parent as a hrefless
 * `<button>` when this is false, because `#` is the WordPress convention for a
 * mega-menu parent that opens children and goes nowhere.
 */
export function isAppNavigationHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/")) {
    // Protocol-relative URLs are not in-app.
    return !href.startsWith("//");
  }
  return false;
}

// `productUrl(slug, colorSlug)` used to live here and built the FLAT
// `/products/{slug}` path. It is gone rather than deprecated: since the
// 2026-08-22 decision the nested `/shop/{cat…}/{slug}` path is canonical and
// the flat one 308s onto it, so a helper that returns the loser is a trap
// wearing a helpful name. Use `productPath` in `lib/canonical-path.ts` — the
// one derivation the canonical tag, the 308 target, every internal link, the
// JSON-LD `url` and the sitemap all share.
