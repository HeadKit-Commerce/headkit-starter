/**
 * Convert a WordPress absolute URI to a relative frontend path.
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
 * @example
 * convertToRelativePath("https://commerce-backend.com/shop/general/beanie/")
 * // → "/shop/general/beanie/"
 *
 * convertToRelativePath("/shop/product/")
 * // → "/shop/product/"
 *
 * convertToRelativePath("tel:1300883919")
 * // → "tel:1300883919"
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

export function convertToRelativePath(uri: string | null | undefined): string {
  if (!uri) return "";
  if (uri.startsWith("/")) return uri;

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
    return new URL(uri).pathname;
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

/**
 * Build the canonical frontend URL for a product.
 *
 * Simple products:   /products/shirt
 * Variable products: /products/shirt/red  (colorSlug = the pa_color option slug)
 */
export function productUrl(slug: string, colorSlug?: string): string {
  return colorSlug ? `/products/${slug}/${colorSlug}` : `/products/${slug}`;
}
