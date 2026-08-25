/**
 * THE canonical storefront path for a product or a collection.
 *
 * Both shapes of a product (`/products/{slug}` and `/shop/{cat…}/{slug}`) and
 * both shapes of a collection (`/collections/{child}` and
 * `/collections/{parent}/{child}`) serve identical content, so exactly one of
 * each must be named by every signal the storefront emits — canonical, `og:url`,
 * the `Location` of the 308 served from the loser, every internal link, the
 * JSON-LD `url`/`offers.url`, and the sitemap entry. This module is the ONE
 * place those strings are derived, so they cannot drift apart.
 *
 * The winner is the NESTED shape for both, per the 2026-08-22 decision: the V1
 * sites' index equity sits on the nested URLs their sitemaps carried.
 *
 * Pure and dependency-free (no SDK, no `next`, no server-only): a client
 * component rendering a product card resolves the same path the sitemap does.
 */

import {
  shopSegmentsFromPath,
  uriToRelativePath,
  SHOP_PATH_PREFIX,
} from "@/app/shop/shop-slug";

/**
 * The minimal product shape a canonical path is derived from.
 *
 * `uri` is WooCommerce's permalink for the product. The schema documents it as
 * relative but `product_mapper.go` assigns the ABSOLUTE permalink, and the
 * related/upsell sub-selections spell the same value `permalink`; both arrive
 * here and {@link uriToRelativePath} normalises either.
 */
export interface CanonicalProductRef {
  slug: string;
  uri?: string | null | undefined;
}

/**
 * The single `/collections/...` path for a category, from its own ancestry.
 *
 * Root-first ancestors then the category's own slug — the shape
 * `app/sitemap.ts` advertises. Empty segments are dropped so a malformed term
 * can never produce an `//` or a trailing-slash path.
 */
export function collectionPathFromSegments(
  segments: readonly (string | null | undefined)[],
): string {
  const clean = segments.filter(
    (segment): segment is string => !!segment && segment.length > 0,
  );
  return `/collections/${clean.join("/")}`;
}

/**
 * The nested `/shop/...` segments for a product, or `null` when it has none.
 *
 * DETERMINISM — the rule, and why it is this one:
 *
 * A product can sit in several categories, so "the product's first category"
 * would make the canonical depend on ordering, and "the category the shopper
 * came from" would make it depend on the referring page — either one puts a
 * different `Location` on the 308 depending on how the URL was reached, which
 * re-creates the duplicate split in a new form. WooCommerce already resolves
 * multi-category membership to exactly ONE permalink per product (its primary
 * category), and every fragment that exposes a product carries that permalink.
 * So the permalink IS the rule: one value per product, identical at every call
 * site, and it is the same value `app/sitemap.ts` and the nested route's
 * `generateStaticParams` already derive their URLs from.
 *
 * Returns null when the permalink is unusable or is not beneath `/shop` — a
 * store on WooCommerce's default `/product/` permalink base has no nested route
 * here, so its products stay on the flat path (see {@link productPath}).
 */
export function productShopSegments(
  product: CanonicalProductRef,
): string[] | null {
  const path = uriToRelativePath(product.uri);
  if (!path) return null;
  const segments = shopSegmentsFromPath(path);
  return segments.length > 0 ? segments : null;
}

/**
 * The canonical path for a product, optionally for one colourway.
 *
 * Nested when the product's permalink gives one, else the flat
 * `/products/{slug}` — which is a real, served, self-canonical URL rather than
 * a fallback that 404s, so a product with no category ancestry stays reachable
 * and never redirect-loops (the flat route only redirects when this function
 * returns something OTHER than the path being requested).
 *
 * A colourway is one more path segment on whichever base won, so
 * `/shop/{cat}/{slug}/{colour}` and `/products/{slug}/{colour}` are the two
 * shapes, and `app/shop/[...slug]` classifies the nested one.
 */
export function productPath(
  product: CanonicalProductRef,
  colourSlug?: string | null,
): string {
  const segments = productShopSegments(product);
  const base = segments
    ? `/${SHOP_PATH_PREFIX}/${segments.join("/")}`
    : `/products/${product.slug}`;
  return colourSlug ? `${base}/${colourSlug}` : base;
}

/**
 * The category chain a product's canonical path carries, root-first.
 *
 * Empty for a product whose permalink has no category ancestry (a `/shop/{slug}`
 * permalink, or a store off the shop base entirely). Used for PDP breadcrumbs
 * so the crumb links name the same collection paths the collection route
 * canonicalises to, rather than a flat `/collections/{first-category}` guess.
 */
export function productCategorySegments(
  product: CanonicalProductRef,
): string[] {
  const segments = productShopSegments(product);
  if (!segments) return [];
  return segments.slice(0, -1);
}
