/**
 * Shop catch-all path resolver — D-15-04 / RESEARCH C-6.
 *
 * `/shop/[...slug]` serves two different things under one catch-all: nested
 * product URLs (`/shop/{cat}[/{sub}]/{slug}`, the shape WordPress mints for
 * WooCommerce products) and category archives (`/shop/{cat}`). The replaced
 * implementation took `slug[slug.length - 1]` unconditionally, so a category
 * URL was treated as a product slug and permanently redirected into a route
 * that answered not-found.
 *
 * Deciding correctly requires consulting the category tree, which is what this
 * module does: flatten the tree into the set of valid segment chains, then
 * match longest-chain-first. A path whose leading segments are not a valid
 * chain is `unknown` — an explicit failure to decide, never a guessed product.
 *
 * Pure and dependency-free by design (no SDK, no `next`, no `@/lib`) so it is
 * unit-testable without a backend. `walkCategoryChains` below duplicates the
 * algorithm of `walkCategoryPaths` in `app/sitemap.ts` deliberately, to keep
 * that purity; the two must be changed together.
 */

/**
 * The archive prefix WordPress mints WooCommerce product permalinks under, and
 * the only prefix `app/shop/[...slug]` serves. Anything outside it has no route
 * in this app, which is why `shopSegmentsFromPath` reports it as no segments.
 */
export const SHOP_PATH_PREFIX = "shop";

/**
 * Normalise a raw `Product.uri` / `Product.permalink` into a site-relative path.
 *
 * The schema and the Go domain type document `uri` as relative, but
 * `product_mapper.go` assigns the ABSOLUTE WooCommerce permalink to it.
 * Correcting that upstream is explicitly deferred (15.1-CONTEXT `<deferred>`),
 * so the consumer normalises — the same compensation `lib/convert-uri.ts`
 * already applies for navigation links.
 *
 * The origin is DISCARDED rather than compared against the storefront origin.
 * In a headless store the WordPress origin is a different host by design (e.g.
 * `commerce.example.com` vs `www.example.com`), so an origin-equality test
 * would reject every product in every store. Callers re-root the returned path
 * under the configured site url, which makes an off-site URL impossible by
 * construction — a stronger guarantee than the comparison would have given.
 *
 * Returns null when no safe path can be derived: blank input, a
 * protocol-relative reference (path-like but resolves off-site when joined to a
 * base url), a non-http(s) scheme, or an unparseable value.
 */
export function uriToRelativePath(uri: string | null | undefined): string | null {
  const raw = uri?.trim();
  if (!raw) return null;

  // `//host/path` is not a path: `new URL("//host/p", site)` resolves off-site.
  if (raw.startsWith("//")) return null;

  if (raw.startsWith("/")) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.pathname;
  } catch {
    return null;
  }
}

/**
 * Split a site-relative path into the segment array `/shop/[...slug]` receives.
 *
 * Returns an empty array when the path is not beneath the shop prefix — a store
 * whose WooCommerce permalink base is `/product/` has no route here that serves
 * it, so callers must fall back to the flat `/products/{slug}` rather than
 * advertise or prerender a path this app answers not-found for. `/shop` itself
 * is served by `app/shop/page.tsx`, not by the catch-all, so it too yields [].
 */
export function shopSegmentsFromPath(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment !== "");
  if (segments[0] !== SHOP_PATH_PREFIX) return [];
  return segments.slice(1);
}

/** A node of the product-category tree, as `collections.getCategories()` returns it. */
export interface ShopCategoryNode {
  slug: string;
  children?: readonly ShopCategoryNode[] | undefined;
}

/** Outcome of classifying a `/shop/...` segment array. */
export type ShopPathResult =
  /** Zero segments — the shop index, not a lookup. */
  | { kind: "index" }
  /** The whole path is a valid category chain. */
  | { kind: "category"; categorySlug: string; segments: string[] }
  /** A (possibly empty) valid category chain followed by exactly one product slug. */
  | { kind: "product"; productSlug: string; categorySegments: string[] }
  /** Could not decide — carries the segment that broke the chain. */
  | { kind: "unknown"; segment: string };

/**
 * WooCommerce's default category. Excluded here for the same reason
 * `walkCategoryPaths` in `app/sitemap.ts` excludes it: it is not a real
 * browsable archive. Both spellings ship depending on WordPress locale.
 */
const EXCLUDED_CATEGORY_SLUGS: readonly string[] = [
  "uncategorised",
  "uncategorized",
];

/**
 * Flatten the category tree into every valid segment chain, joined by "/".
 *
 * The result is prefix-closed — every ancestor chain is present — which is what
 * lets `resolveShopPath` validate a chain incrementally and name the exact
 * segment that broke it.
 *
 * Mirrors `walkCategoryPaths` in `app/sitemap.ts`; keep the two in step.
 */
function walkCategoryChains(
  categories: readonly ShopCategoryNode[],
  parentSegments: readonly string[] = [],
): string[] {
  const out: string[] = [];
  for (const cat of categories) {
    if (!cat?.slug) continue;
    if (EXCLUDED_CATEGORY_SLUGS.includes(cat.slug)) continue;
    const segments = [...parentSegments, cat.slug];
    out.push(segments.join("/"));
    if (cat.children?.length) {
      out.push(...walkCategoryChains(cat.children, segments));
    }
  }
  return out;
}

/**
 * Classify a `/shop/...` segment array against the category tree.
 *
 * Matching is longest-chain-first: the full path is tested as a category before
 * the leading segments are tested as a chain carrying a trailing product slug.
 * Slug comparison is case-sensitive and performs no trimming or normalisation —
 * a case-folded or trimmed match would resolve URLs WordPress does not serve.
 */
export function resolveShopPath(
  segments: readonly string[],
  categories: readonly ShopCategoryNode[],
): ShopPathResult {
  if (segments.length === 0) return { kind: "index" };

  // Reject empty segments up front, so an empty trailing segment can never
  // become a product lookup for the empty string.
  const empty = segments.find((s) => s === "");
  if (empty !== undefined) return { kind: "unknown", segment: "" };

  const chains = new Set(walkCategoryChains(categories));

  // Longest chain first: the entire path may itself be a category archive.
  if (chains.has(segments.join("/"))) {
    const last = segments[segments.length - 1] ?? "";
    return { kind: "category", categorySlug: last, segments: [...segments] };
  }

  const lead = segments.slice(0, -1);
  const productSlug = segments[segments.length - 1] ?? "";

  // A bare `/shop/{slug}` has no category chain to validate.
  if (lead.length === 0) {
    return { kind: "product", productSlug, categorySegments: [] };
  }

  // Validate the leading chain incrementally so the offending segment is named.
  const walked: string[] = [];
  for (const segment of lead) {
    walked.push(segment);
    if (!chains.has(walked.join("/"))) {
      return { kind: "unknown", segment };
    }
  }

  return { kind: "product", productSlug, categorySegments: lead };
}
