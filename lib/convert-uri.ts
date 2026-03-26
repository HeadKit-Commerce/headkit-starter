/**
 * Convert a WordPress absolute URI to a relative frontend path.
 *
 * WooCommerce returns `uri` as a full absolute URL pointing to the WordPress
 * backend (e.g. "https://commerce-backend.com/shop/general/beanie/").
 * Next.js <Link href> must receive a relative path so navigation stays within
 * the Next.js frontend rather than redirecting to the WP origin.
 *
 * @example
 * convertToRelativePath("https://commerce-backend.com/shop/general/beanie/")
 * // → "/shop/general/beanie/"
 *
 * convertToRelativePath("/shop/product/")
 * // → "/shop/product/"
 */
export function convertToRelativePath(uri: string | null | undefined): string {
  if (!uri) return "";
  if (uri.startsWith("/")) return uri;
  try {
    return new URL(uri).pathname;
  } catch {
    return uri;
  }
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
