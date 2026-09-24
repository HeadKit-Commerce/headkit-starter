/**
 * Rebuild a CMS menu item's `/collections/...` href into the canonical nested
 * path, from the category tree rather than from what the CMS stored.
 *
 * WHY THIS EXISTS — the href a menu item arrives with is NOT the WordPress
 * permalink. The HeadKit WordPress theme's menus endpoint
 * (`integrations/wordpress/theme/inc/rest-api/headkit-menus.php`) replaces the
 * stored URL of every `product_cat` menu item with the FLAT
 * `/collections/{leaf-slug}`, discarding the hierarchical term permalink
 * WooCommerce built. Since the 2026-08-22 canonical decision the nested
 * `/collections/{parent}/{child}` path is canonical and the flat one 308s onto
 * it, so every menu link naming a CHILD category costs a redirect hop. A root
 * category is self-canonical and unaffected, which is why the damage looks
 * partial per store: measured on one migrated store, 108 of its 128 category
 * menu links changed here and the 20 root ones did not.
 *
 * The fix cannot live in the stored data: the theme overwrites it on every
 * read, so a corrected URL in Appearance → Menus would never reach the
 * storefront. It belongs here because the storefront is what decides which
 * shape is canonical, and `AGENTS.md` ("One derivation, never a second")
 * requires that decision to have exactly one source — the category tree, via
 * `collectionPathIndex` in `lib/collection-path.ts`, which is the same walk
 * `app/sitemap.ts` and `generateStaticParams` already use.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH. A menu item may legitimately point at
 * something that is not a category's canonical path, and rewriting one of those
 * would be a worse bug than the hop:
 *
 *  - anything that is not an in-app `/collections/...` path — external links,
 *    `tel:` / `mailto:`, CMS pages, `/shop`, `/`, a mega-menu column container;
 *  - a leaf slug the category tree does not contain (an excluded category, a
 *    stale pick, a hand-typed landing path). Those are left EXACTLY as they
 *    arrived rather than passed through `collectionPathResolver`'s
 *    `/collections/{slug}` fallback, because that fallback would FLATTEN a
 *    hand-authored nested href;
 *  - the `hk-collection:{slug}` CSS class is deliberately NOT used as the
 *    trigger. The theme stamps it on taxonomy items, but it can also be set by
 *    hand on a Custom Link whose destination is a curated landing page — and
 *    that is precisely the link that must keep its own href.
 *
 * An indexable facet tail (`/collections/{cat…}/f/{slug}`) is preserved: only
 * the category part ahead of the `f` segment is re-derived.
 *
 * Pure: the caller supplies the lookup, so this is unit-testable with no SDK.
 */

import { COLLECTION_PATH_PREFIX } from "@/lib/route-prefixes";

/** Path segment that opens the indexable facet tail of a collection URL. */
const FACET_SEGMENT = "f";

/** Canonical path for a category slug, or `undefined` when the tree has none. */
export type CollectionPathLookup = (slug: string) => string | undefined;

/** Menu-node shape this rewrite needs: an href plus optional children. */
export type MenuHrefNode = {
  uri: string;
  children?: MenuHrefNode[] | undefined;
};

function decodeSlug(segment: string): string {
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
}

/**
 * The canonical href for one menu URI, or the URI unchanged when no rule
 * applies. Idempotent: a path that is already canonical resolves to itself.
 */
export function canonicalCollectionHref(
  uri: string | null | undefined,
  lookup: CollectionPathLookup,
): string {
  if (!uri || !uri.startsWith("/")) return uri ?? "";

  const cut = Math.min(
    ...[uri.indexOf("?"), uri.indexOf("#")]
      .filter((i) => i >= 0)
      .concat([uri.length]),
  );
  const pathname = uri.slice(0, cut);
  const suffix = uri.slice(cut);

  const segments = pathname.split("/").filter((part) => part.length > 0);
  if (segments[0] !== COLLECTION_PATH_PREFIX) return uri;

  const rest = segments.slice(1);
  const facetIndex = rest.indexOf(FACET_SEGMENT);
  const categorySegments = facetIndex >= 0 ? rest.slice(0, facetIndex) : rest;
  const tail = facetIndex >= 0 ? rest.slice(facetIndex) : [];

  const leaf = categorySegments[categorySegments.length - 1];
  if (!leaf) return uri;

  const canonical = lookup(decodeSlug(leaf));
  if (!canonical) return uri;

  const rebuilt =
    tail.length > 0 ? `${canonical}/${tail.join("/")}` : canonical;
  return `${rebuilt}${suffix}`;
}

/**
 * Apply {@link canonicalCollectionHref} to a menu tree, at every depth.
 *
 * Every other field — id, label, classes, ordering, children — is preserved, so
 * the mega-menu column contract (`lib/menu-columns.ts`) and the hide-empty pass
 * (`lib/hide-empty-collections.ts`) are unaffected whichever order they run in.
 */
export function applyCanonicalCollectionHrefs<T extends MenuHrefNode>(
  items: readonly T[],
  lookup: CollectionPathLookup,
): T[] {
  return items.map((item) => ({
    ...item,
    uri: canonicalCollectionHref(item.uri, lookup),
    ...(Array.isArray(item.children)
      ? { children: applyCanonicalCollectionHrefs(item.children, lookup) }
      : {}),
  }));
}
