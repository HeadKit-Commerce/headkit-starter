import type { ProductFilters } from "@headkit/sdk";

/**
 * Which `category × brand` Tier-1 facet URLs are worth building ahead of time.
 *
 * `app/collections/[...slug]/page.tsx` (generateStaticParams) and
 * `app/sitemap.ts` both emit this family, so the decision lives here once: if
 * they disagree the sitemap advertises URLs the build never prerendered. This
 * mirrors what `lib/color-attr-slug.ts` does for the colour facets.
 *
 * ## Why this exists
 *
 * Both emitters used to loop `categories × brands.list()` with no check that
 * the pair contained anything, because brands were global and `getFilters` did
 * not report a per-category brand list. On one 100-category / 100-brand store
 * that is 10,000 prerendered pages of which 9,499 render an empty grid — 65% of
 * the whole build, and it grows QUADRATICALLY with the catalogue, so it gets
 * worse exactly where a store is bigger.
 *
 * `ProductFilters.brands` closes it at no extra read cost: the WordPress
 * endpoint behind `getFilters` has always computed per-scope brand counts
 * (`headkit_get_brands_with_counts` emits a brand only when its count inside
 * the `mainCategory` tax query is > 0), and both emitters already call
 * `getFilters` once per category for the colour facets. The pairs therefore
 * come free from a call the build already makes — no second query, no
 * per-pair probe.
 *
 * ## This narrows PRERENDERING only
 *
 * An un-emitted pair is not a dead URL. `/collections/<cat>/f/brand.<b>` still
 * routes, still renders on demand and still answers 200 — it just pays a cold
 * render on first hit. Nothing here calls `notFound()` or otherwise touches the
 * route's runtime behaviour, so a brand that later gains a product in a
 * category serves correctly before the next build.
 */

/** A brand slug list scoped to one category, or null when it cannot be known. */
export type CategoryBrandSource = Pick<ProductFilters, "brands"> | null;

/**
 * The brand slugs to emit for ONE category.
 *
 * `globalBrandSlugs` is the store-wide list (`brands.list()`), used both as the
 * intersection guard — a brand the store no longer lists is never emitted — and
 * as the fallback described below.
 *
 * Returns a de-duplicated list preserving `globalBrandSlugs` order, so the
 * emitted param order is stable across the two call sites.
 */
export function brandSlugsForCategory(
  filters: CategoryBrandSource,
  globalBrandSlugs: readonly string[],
): string[] {
  const global = dedupe(globalBrandSlugs);
  const scoped = new Set(
    (filters?.brands ?? [])
      .map((b) => b?.slug ?? "")
      .filter((s): s is string => s.length > 0),
  );
  if (scoped.size === 0) return [];
  return global.filter((slug) => scoped.has(slug));
}

/**
 * True when NO category in the store reported a scoped brand list while the
 * store itself does list brands.
 *
 * That combination cannot be a real catalogue: if a store has brands, some
 * category stocks one. It means the backend cannot report per-scope brands —
 * a commerce deploy predating `ProductFilters.brands`, a WordPress theme
 * predating the endpoint's `brands` key, or a provider that returns none
 * (Shopify). Distinguishing it matters because the two readings of an empty
 * list have opposite remedies: "this category stocks no brand" should emit
 * nothing, while "the brand list is unknowable" should keep the previous
 * cross-product rather than silently drop every working brand facet page in
 * the store.
 */
export function shouldFallBackToGlobalBrands(
  perCategoryFilters: readonly CategoryBrandSource[],
  globalBrandSlugs: readonly string[],
): boolean {
  if (globalBrandSlugs.length === 0) return false;
  return perCategoryFilters.every(
    (f) => (f?.brands ?? []).filter((b) => (b?.slug ?? "") !== "").length === 0,
  );
}

/**
 * Resolve the per-category brand slug lists for a whole store in one pass —
 * the entry point both emitters use, so the fallback decision is made from the
 * same evidence on both sides.
 *
 * `entries` must carry one row per category node, in the order the caller
 * intends to emit. The returned array is parallel to it.
 */
export function brandSlugsPerCategory(
  entries: readonly CategoryBrandSource[],
  globalBrandSlugs: readonly string[],
): string[][] {
  const global = dedupe(globalBrandSlugs);
  if (shouldFallBackToGlobalBrands(entries, global)) {
    return entries.map(() => [...global]);
  }
  return entries.map((f) => brandSlugsForCategory(f, global));
}

function dedupe(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
