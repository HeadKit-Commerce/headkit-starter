/**
 * Attribute slugs treated as the indexable "color" facet (Tier-1).
 *
 * The URL/filter convention is `pa_color`/`pa_colour` (decodeFilterSlug re-adds
 * the `pa_` prefix; the backend ProductListFilter expects `pa_color`). But the
 * SDK's getFilters() returns DISPLAY attribute slugs with the prefix STRIPPED
 * (`color`/`colour`). Both forms must be recognised so the predicate works on
 * decoded filter values AND raw filter-option slugs.
 */
export const COLOR_ATTR_SLUGS = [
  "pa_color",
  "pa_colour",
  "color",
  "colour",
] as const;

/**
 * Normalise an SDK attribute slug (prefix stripped, e.g. `colour`) into the
 * `pa_`-prefixed key FilterValues.attributes / decodeFilterSlug use (e.g.
 * `pa_colour`). encodeFilterSlug strips `pa_` again for the URL, so this only
 * matters for the in-memory FilterValues key and the GraphQL filter built
 * from it — never hard-code `pa_color` for a store's own attribute slug.
 */
export function toAttributeKey(sdkSlug: string): string {
  return sdkSlug.startsWith("pa_") ? sdkSlug : `pa_${sdkSlug}`;
}

/** True if an attribute slug is a colour option, including 1-product bundles. */
export function isColorAttrSlug(slug: string): boolean {
  const n = slug.trim().toLowerCase();
  if ((COLOR_ATTR_SLUGS as readonly string[]).includes(n)) {
    return true;
  }
  // Shopify 1-product / 2-pc bundles slug "Monogram Bath Towel (Colour)"
  // to monogram-bath-towel-colour. Collection Tier-1 SEO still uses the
  // exact COLOR_ATTR_SLUGS list — this only drives PDP colourways / swatches.
  return n.endsWith("-colour") || n.endsWith("-color");
}
