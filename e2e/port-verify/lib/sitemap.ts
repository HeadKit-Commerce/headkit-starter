/**
 * Sitemap membership, treated as a captured signal and never as the source of
 * the capture list.
 *
 * `canonical-url-308.spec.ts` reads its fixtures FROM the sitemap, which is
 * correct for a store whose sitemap is populated and useless against one whose
 * sitemap is empty — both rehearsal storefronts currently publish a 110-byte
 * `<urlset>` with zero entries. This harness therefore takes its URL list from
 * the store's inventory fixture and records sitemap membership as one more
 * field that a port can flip.
 */

/** Every `<loc>` in a urlset or a sitemapindex, in document order. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]!);
}

/** Whether the document is a sitemap index rather than a urlset. */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}
