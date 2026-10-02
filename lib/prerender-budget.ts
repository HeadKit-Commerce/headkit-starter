/**
 * Per-store budgets for the URL families a build may prerender.
 *
 * Build time is a per-store resource against a hard ceiling (45 minutes on
 * Vercel), and the two families below are the ones whose size is decided by a
 * store's own catalogue rather than by the template. A store with 150
 * categories and 2,800 facet combinations cannot afford what a store with 12
 * categories can. The shape of the emitted param set is configuration, not a constant: the platform default
 * reproduces exactly what every storefront builds today, and a store that has
 * MEASURED its own build moves the number.
 *
 * CONVENTION, because a silent alternative is how a store sets the opposite
 * of what it meant:
 *
 *   unset / empty   the platform default for that family (stated per key below)
 *   a decimal       emit at most that many params; `0` emits NONE
 *   `unlimited`     no cap
 *
 * Product HTML is not configured here. Both PDP routes follow the HeadKit
 * API plan in `lib/product-prerender-plan.ts`. This file is the collection
 * facet family only. `0` emits none of that family.
 *
 * A param that is NOT prerendered is not a missing page. Neither route sets
 * `dynamicParams = false`, so an un-emitted URL still routes, still answers
 * 200, and still renders the same markup — it pays a cold render on its first
 * visitor and is a CDN hit thereafter. Prerendering is not indexability
 * either: `app/sitemap.ts` advertises what EXISTS and keeps its own rules, so
 * the two emitters agreeing on a set is a property to assert where it is
 * wanted (`app/product-url-emitter-parity.test.ts`), never an invariant to
 * assume.
 */

/**
 * The facet key is read from `process.env` DIRECTLY rather than through
 * `lib/env.ts`, which is where it is declared, documented and validated for
 * the boot parse. The accessor runs inside `generateStaticParams` on a
 * catalogue route whose unit tests render without a configured storefront,
 * and pulling the Zod boot parse into them buys nothing:
 * {@link resolvePrerenderBudget} does the narrowing and is tested directly.
 */

/** No cap — every param the family can produce is emitted. */
export const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * `/collections/[...slug]` facet params (`/f/<slug>`), one per category per
 * stocked colour and per stocked brand.
 *
 * DEFAULT: {@link UNLIMITED} — today's behaviour on every storefront.
 *
 * Why a store might cut it: since the PLP static-shell change, every
 * prerendered collection param renders page 1 of its grid, so each one costs a
 * catalogue read against an origin that commerce paces (~1.8 req/s on a
 * WordPress store). On one measured 154-category store the 2,839 facet params
 * took that family from 11.5 minutes of static generation to roughly 32 pages
 * per minute, and the build hit the 45-minute ceiling at 4,329 of 6,039 pages.
 * Setting this to `0` there took the page count to 3,200 and the family's
 * build-time catalogue reads from 2,993 to 154.
 *
 * `0` is the only value that removes the build-time READS as well as the
 * params: a finite non-zero cap still has to ask each category which facets it
 * stocks before it can decide which ones to keep.
 */
export const COLLECTION_FACET_PARAM_BUDGET_DEFAULT = UNLIMITED;


/**
 * Parse one budget value. Exported for its own test; the accessor below calls it.
 *
 * An unparseable value falls back to the default rather than throwing, for the
 * same reason `lib/cache-profile.ts` does: a typo in a store's environment must
 * not take its build down.
 */
export function resolvePrerenderBudget(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  if (raw === "unlimited") return UNLIMITED;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** How many `/collections` facet params this store's build may emit. */
export function collectionFacetParamBudget(): number {
  return resolvePrerenderBudget(
    process.env.HEADKIT_PRERENDER_COLLECTION_FACETS,
    COLLECTION_FACET_PARAM_BUDGET_DEFAULT,
  );
}
