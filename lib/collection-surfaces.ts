import type { CatalogTheme } from "@/lib/store-theme";

/** Catalog surfaces that can show an ordered collection allowlist. */
export type CollectionSurface = "homepage" | "shop";

/**
 * Ordered collection slugs for a catalog surface.
 * `null` means no allowlist — callers keep the existing first-N / all-roots list.
 * An empty array is treated the same as omit (pass-through), so a typo cannot
 * blank every tile. Stage 2 metafields feed this same helper.
 */
export function collectionSlugsForSurface(
  catalog: CatalogTheme | undefined,
  surface: CollectionSurface,
): readonly string[] | null {
  const raw =
    surface === "homepage"
      ? catalog?.homepageCollections
      : catalog?.shopCollections;
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  return raw;
}

/**
 * Pick collections by slug in allowlist order. Unknown slugs are skipped.
 * `null` / empty slugs pass the input through (no allowlist).
 */
export function pickCollectionsBySlugs<T extends { slug?: string | null }>(
  items: readonly T[],
  slugs: readonly string[] | null,
): T[] {
  if (slugs === null || slugs.length === 0) {
    return [...items];
  }
  const bySlug = new Map<string, T>();
  for (const item of items) {
    const slug = item.slug?.trim().toLowerCase();
    if (!slug || bySlug.has(slug)) {
      continue;
    }
    bySlug.set(slug, item);
  }
  const picked: T[] = [];
  for (const raw of slugs) {
    const slug = raw.trim().toLowerCase();
    const item = bySlug.get(slug);
    if (item !== undefined) {
      picked.push(item);
    }
  }
  return picked;
}
