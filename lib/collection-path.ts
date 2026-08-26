import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { walkCategoryPaths } from "@/app/shop/shop-slug";
import { collectionPathFromSegments } from "@/lib/canonical-path";
import { TAG } from "@/lib/cache-tags";

/**
 * Canonical `/collections/...` path for a category known only by its slug.
 *
 * The collection route derives its canonical from `category.ancestors`, and a
 * subcategory tile gets its parent's path handed down — but three surfaces have
 * neither: the homepage "Shop by Category" strip, the editorial Handpicked
 * Categories block, and anything else fed by `FeaturedCategory`, whose payload
 * carries a slug and a WordPress permalink and no ancestry at all. Linking
 * those as `/collections/{slug}` is what makes a nested category's tile point
 * at the flat shape the route now 308s away from.
 *
 * The category tree is the one place the ancestry is available for an arbitrary
 * slug, so it is read once, cached, and turned into an index. Building the
 * paths through {@link walkCategoryPaths} — the same walk `resolveShopPath` and
 * `app/sitemap.ts` use — is what keeps a tile's href and the sitemap entry the
 * same string.
 *
 * A slug the tree does not contain (a category hidden from the list endpoint,
 * a stale editorial pick) falls back to `/collections/{slug}`: still a URL this
 * app serves, which then 308s to the canonical if one exists. Degrading to a
 * served path matters more than the extra hop — the alternative is a tile that
 * links nowhere.
 */
async function collectionPathIndex(): Promise<Map<string, string>> {
  "use cache";
  // `days`, deliberately, and NOT the `hours` the other category reads use.
  // Next 16.3 propagates a nested entry's cache life outward to the enclosing
  // one and takes the MIN, so an `hours` entry awaited inside `HomeContent`
  // (`"use cache"` + `cacheLife("days")`) would silently narrow the whole
  // homepage to hourly revalidation. `TAG.collections` — which WordPress fires
  // on any product or category change, and which `HomeContent` already
  // subscribes to — is what actually keeps this fresh; the life is only a
  // backstop, so matching the caller's costs nothing.
  cacheLife("days");
  cacheTag(TAG.collections);

  const categories = await sdk.collections.getCategories();
  const index = new Map<string, string>();
  for (const node of walkCategoryPaths(categories)) {
    // First win in DOCUMENT order — the walk is a pre-order DFS, which emits a
    // node before its siblings' subtrees, so a slug that somehow appeared twice
    // would keep whichever occurrence the tree lists first, at whatever depth,
    // and NOT the shallowest. WordPress term slugs are unique per taxonomy, so
    // no real store reaches the tie; the rule is only here so the index is
    // deterministic rather than last-write-wins.
    if (!index.has(node.slug)) {
      index.set(node.slug, collectionPathFromSegments(node.segments));
    }
  }
  return index;
}

/**
 * A slug → canonical-path lookup, resolved once per render.
 *
 * Returns a function rather than a map so callers keep their own ordering and
 * filtering, and so the fallback for an unknown slug lives in one place.
 *
 * A thrown SDK error is deliberately NOT caught, matching the two sibling
 * category reads that also let one propagate (`getShopCategoryTree` in
 * `app/shop/[...slug]/page.tsx`, `CollectionRoute` in
 * `app/collections/[...slug]/page.tsx`). Propagating does not leave a category
 * strip with no links: Next serves the last good render and retries. Catching
 * is strictly worse — an empty index makes every tile emit the FLAT
 * `/collections/{slug}` shape, and both callers render inside `"use cache"` /
 * `cacheLife("days")` scopes (`HomeContent`, `BlockEditor`), so that degraded
 * render is WRITTEN to the cache entry and pinned for up to a day. One
 * transient blip would advertise the losing shape to crawlers for a day.
 *
 * The unknown-slug fallback below is a different case and stays: a slug the
 * tree genuinely does not contain is data, not a transport failure.
 */
export async function collectionPathResolver(): Promise<
  (slug: string) => string
> {
  const index = await collectionPathIndex();
  return (slug: string): string =>
    index.get(slug) ?? collectionPathFromSegments([slug]);
}
