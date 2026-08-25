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
 * match longest-chain-first. A path that IS a valid chain is never read as a
 * product; a path that is not takes the product reading, which the product
 * lookup then confirms or rejects.
 *
 * Pure and dependency-free by design (no SDK, no `next`, no `@/lib`) so it is
 * unit-testable without a backend — and so `lib/canonical-path.ts` can build on
 * it without a cycle. {@link walkCategoryPaths} lives here for the same reason:
 * it used to be duplicated in `app/sitemap.ts` "deliberately, to keep that
 * purity", with a comment asking the two to be changed together. They are one
 * function now, because the category ancestry a URL is built from is exactly
 * the thing that must never drift between the sitemap and the routes.
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
export function uriToRelativePath(
  uri: string | null | undefined,
): string | null {
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

/**
 * One reading of a `/shop/...` path as a product, optionally with its colourway.
 *
 * `ancestryValidated` says whether every segment BEFORE the product slug was
 * matched against the category tree. FALSE means this reading consumes segments
 * the tree could not confirm, so it is a guess about a truncated tree rather
 * than a validated chain — and a caller must NOT serve it on the strength of
 * the slug alone. See the containment note in {@link resolveShopPath} for the
 * check that makes such a reading safe.
 */
export interface ShopProductCandidate {
  productSlug: string;
  colourSlug?: string;
  ancestryValidated: boolean;
}

/** Outcome of classifying a `/shop/...` segment array. */
export type ShopPathResult =
  /** Zero segments — the shop index, not a lookup. */
  | { kind: "index" }
  /** The whole path is a valid category chain. */
  | { kind: "category"; categorySlug: string; segments: string[] }
  /**
   * The path reads as a product. `candidates` are the readings to try against
   * the catalogue IN PRIORITY ORDER — the classifier is pure and has no
   * catalogue access, so it cannot choose between them itself.
   *
   * `categorySegments` is the chain that WAS matched against the tree,
   * root-first, and is the only ancestry safe to build a breadcrumb or a
   * canonical from. It does NOT cover the segments an `ancestryValidated: false`
   * candidate consumes; those name categories this store's tree does not
   * contain, and are deliberately not exposed.
   */
  | {
      kind: "product";
      candidates: readonly ShopProductCandidate[];
      categorySegments: string[];
    }
  /**
   * Could not decide. Carries the segment the decision failed on — a malformed
   * (empty) segment, or a chain that validates end-to-end without naming a
   * browsable archive, which leaves no product slug to look up.
   */
  | { kind: "unknown"; segment: string };

/**
 * WooCommerce's default category — not a browsable archive this storefront
 * offers, so it never resolves as one. It IS part of a public URL, though:
 * WordPress mints permalinks through the term, so an uncategorised product
 * lives at `/shop/uncategorised/{slug}`. See the two chain sets in
 * {@link resolveShopPath} for why those two facts must stay separate.
 * Both spellings ship depending on WordPress locale.
 */
const EXCLUDED_CATEGORY_SLUGS: readonly string[] = [
  "uncategorised",
  "uncategorized",
];

/**
 * Walk the category tree at any depth, yielding every category with its full
 * root-first segment chain.
 *
 * The result is prefix-closed — every ancestor chain is present — which is what
 * lets `resolveShopPath` validate a chain incrementally and name the exact
 * segment that broke it, and what lets the sitemap and the link helpers emit
 * the same nested path for the same category.
 *
 * `includeExcluded` keeps WooCommerce's default category. Wanted when
 * enumerating params to prerender, and when validating a permalink's ANCESTRY
 * (WordPress mints permalinks through that term); never when deciding whether a
 * path is a browsable archive.
 */
export function walkCategoryPaths(
  categories: readonly ShopCategoryNode[],
  options: { includeExcluded?: boolean } = {},
  parentSegments: readonly string[] = [],
): { slug: string; segments: string[] }[] {
  const out: { slug: string; segments: string[] }[] = [];
  for (const cat of categories) {
    if (!cat?.slug) continue;
    if (
      !options.includeExcluded &&
      EXCLUDED_CATEGORY_SLUGS.includes(cat.slug)
    ) {
      continue;
    }
    const segments = [...parentSegments, cat.slug];
    out.push({ slug: cat.slug, segments });
    if (cat.children?.length) {
      out.push(...walkCategoryPaths(cat.children, options, segments));
    }
  }
  return out;
}

/**
 * Classify a `/shop/...` segment array against the category tree.
 *
 * Matching is longest-chain-first: the full path is tested as a category, then
 * the LONGEST leading run of segments that forms a valid chain is taken as the
 * category ancestry and whatever follows is the remainder. Because the chain
 * set is prefix-closed, the longest valid run ends at the first segment that
 * breaks the chain, which is the segment an `unknown` result names.
 *
 * A remainder of one segment is a product; a remainder of two is a product and
 * its colourway (`/shop/{cat…}/{slug}/{colour}` — the nested shape of the
 * `/products/{slug}/{colour}` URLs, which the canonical decision moved into
 * this namespace along with the base PDP). Both are read off a chain the tree
 * confirmed, so they come back `ancestryValidated: true` and a caller may serve
 * them on the strength of the product lookup alone.
 *
 * Every path also gets the CONTAINMENT readings of its tail — the last segment
 * as the product, and the last two as product + colourway — marked
 * `ancestryValidated: false`. They exist because the category tree is truncated
 * by construction and a real permalink can therefore carry ancestry the tree
 * does not contain; they are guesses, and the caller must verify each against
 * the resolved product's own permalink before serving it. See the branch.
 *
 * A remainder of ZERO is `unknown`: the chain validated end-to-end without the
 * path naming a browsable archive (`/shop/uncategorised`), so there is no
 * product slug to look up at all.
 *
 * What the two tests above guarantee, and what this must never weaken, is that
 * a path which IS a valid category chain never reaches a product lookup — that
 * lookup returning null is what produced the old 308-into-404 (RESEARCH C-6).
 *
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

  // TWO chain sets, and the difference between them is load-bearing.
  //
  // `archiveChains` excludes WooCommerce's default category because
  // `/shop/uncategorised` is not a browsable archive and must never resolve as
  // one. But WordPress still MINTS a permalink through it: a product the
  // merchant never categorised is filed under Uncategorised, so its permalink
  // is `/shop/uncategorised/{slug}` — and that is the URL `productPath` derives,
  // every internal link renders, the canonical names and the sitemap advertises.
  //
  // Excluding it from ANCESTRY too made that whole URL family unresolvable: the
  // chain matched nothing, the two leftover segments were read as product +
  // colourway, the product lookup for `uncategorised` returned null and the PDP
  // answered 404. Uncategorised is WooCommerce's default, so that is every
  // product a merchant has not filed — caught by the e2e suite on the two
  // fixtures seeded without a category (`glam-booth-all-types`,
  // `taxed-test-product`).
  //
  // So: excluded categories are valid ANCESTRY (they appear in real permalinks)
  // and invalid ARCHIVES (they are not pages this storefront offers).
  const archiveChains = new Set(
    walkCategoryPaths(categories).map((node) => node.segments.join("/")),
  );
  const ancestryChains = new Set(
    walkCategoryPaths(categories, { includeExcluded: true }).map((node) =>
      node.segments.join("/"),
    ),
  );

  // Longest chain first: the entire path may itself be a category archive.
  if (archiveChains.has(segments.join("/"))) {
    const last = segments[segments.length - 1] ?? "";
    return { kind: "category", categorySlug: last, segments: [...segments] };
  }

  // Longest leading run of segments that is still a valid chain. The chain set
  // is prefix-closed, so this stops at the first segment that breaks it.
  let chainLength = 0;
  const walked: string[] = [];
  for (const segment of segments) {
    walked.push(segment);
    if (!ancestryChains.has(walked.join("/"))) break;
    chainLength += 1;
  }

  const categorySegments = segments.slice(0, chainLength);
  const remainder = segments.slice(chainLength);

  const first = remainder[0];
  if (first === undefined) {
    // The chain validated end-to-end yet the whole path is not a browsable
    // archive — `/shop/uncategorised`, whose term IS valid ancestry but is not a
    // page this storefront offers. No product slug is left to look up, so this
    // is a genuine failure to decide rather than a product reading. Reading
    // "the last segment of the remainder" here would hand the caller
    // `undefined`, and from there a `GetProduct` query with no variable.
    return { kind: "unknown", segment: segments[segments.length - 1] ?? "" };
  }

  const candidates: ShopProductCandidate[] = [];

  // The reading the VALIDATED chain supports: everything ahead of the remainder
  // was matched against the tree, so the remainder is the product and, when
  // present, its colourway. Only expressible while the remainder is short enough
  // to BE a product and a colourway.
  if (remainder.length <= 2) {
    const colourSlug = remainder[1];
    candidates.push({
      productSlug: first,
      ...(colourSlug !== undefined ? { colourSlug } : {}),
      ancestryValidated: true,
    });
  }

  // CONTAINMENT READINGS, and they are NOT the cure.
  //
  // The tree validated against is truncated by construction: commerce asks
  // WooCommerce for the category list with no paging or `hide_empty` override,
  // so a category outside that page is missing and a child whose parent is
  // missing is PROMOTED TO A ROOT. WordPress still mints the product's permalink
  // through the true parent chain, so the permalink is
  // `/shop/{missing}/{child}/{slug}` — the path `productPath` derives, every
  // internal link renders, the canonical names, the sitemap advertises, and
  // `/products/{slug}` now 308s onto. Refusing it left that product with no
  // working address at all.
  //
  // So when the chain breaks early, the tail is offered as a product too: the
  // LAST segment alone, then the last two as product + colourway (a colourway is
  // `productPath(product, colour)` with one segment appended, and is just as
  // fatal — it is every swatch href and every `hasVariant[].offers.url`).
  //
  // These readings are GUESSES, which is why they carry `ancestryValidated:
  // false`. What makes them safe is the caller's check, not their position: such
  // a candidate is served only when the resolved product's OWN permalink
  // reproduces the requested path. That one comparison is what keeps a junk
  // prefix in front of a real slug from serving 200, and what stops a colour
  // segment resolving to an unrelated product that happens to be slugged `red`.
  //
  // What this does NOT fix: the truncated tree still yields wrong breadcrumbs,
  // wrong canonical ancestry, and a sitemap advertising promoted-orphan paths.
  // The cure is at the origin — commerce requesting the full category list
  // (`per_page` / `hide_empty=false`) so the forest stops promoting a child
  // whose parent fell outside the page. Tracked as
  // `260822-commerce-category-list-orphan-promotion` (P1).
  const last = remainder[remainder.length - 1];
  const beforeLast = remainder[remainder.length - 2];
  if (last !== undefined && beforeLast !== undefined) {
    candidates.push({ productSlug: last, ancestryValidated: false });
    // At a remainder of exactly two this reading IS the validated candidate
    // above, so adding it would only repeat a lookup that already ran.
    if (remainder.length > 2) {
      candidates.push({
        productSlug: beforeLast,
        colourSlug: last,
        ancestryValidated: false,
      });
    }
  }

  return { kind: "product", candidates, categorySegments };
}
