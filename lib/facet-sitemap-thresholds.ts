import { env } from "@/lib/env";

/**
 * Which `/collections/<cat>/f/<facet>` URLs are worth ADVERTISING in the
 * sitemap, judged on the product count the facet option already carries.
 *
 * ## Why the mechanism exists
 *
 * A facet URL that is not prerendered is a URL we ask crawlers to fetch and
 * then serve with a cold render — measured on one store at 3.29–4.15 s cold
 * against 0.16–0.42 s warm. A facet page listing one product is also a thin
 * near-duplicate of that product's own page: it dilutes the index rather than
 * adding to it, and it is precisely the page whose cold render nobody benefits
 * from. So a store that has narrowed its prerendered facet coverage wants a way
 * to stop advertising the facets that were never worth indexing.
 *
 * ## The platform default is NO CUT, and that is deliberate
 *
 * Both bars default to `0`, so every facet URL the emitter produces today is
 * still advertised. The numbers that make a cut worthwhile are a property of
 * one store's catalogue, not of the platform: on the store this was measured
 * on, COLOUR sat 80.2 % at exactly one product and 90.7 % at two or fewer
 * (median 1, because the slugs are per-model paint names), while BRAND was only
 * 28.1 % at one product (median 3, max 322, because `specialized helmets` is a
 * real search intent). That store's answer was colour >= 3 and brand >= 2 —
 * 7,223 `loc`s down to 5,071. A store whose colour slugs are generic would lose
 * good URLs at the same bar.
 *
 * The two bars are therefore SEPARATE per-store levers, and a store that wants
 * the cut sets them:
 *
 *   HEADKIT_SITEMAP_MIN_COLOUR_FACET_PRODUCTS=3
 *   HEADKIT_SITEMAP_MIN_BRAND_FACET_PRODUCTS=2
 *
 * Do not collapse them into one value. A two-product colour is thin; a
 * two-product brand is not.
 *
 * ## This narrows ADVERTISING only
 *
 * A dropped URL is not a dead URL. `/collections/<cat>/f/colour.<c>` still
 * routes, still renders its correctly filtered grid and still answers 200 — the
 * filter checkboxes on the PLP navigate to exactly these URLs and are
 * unaffected. Nothing here calls `notFound()` or touches the route at all. This
 * module is pure and performs NO read: `count` is already selected by the
 * `GetFilters` query the sitemap calls once per category for the colour facets
 * (`ProductFilterOption.count` in `@headkit/sdk`), so the whole cut is free and
 * adds no cache tag to `app/sitemap.ts`'s single entry.
 *
 * A change to either value reaches production only by REDEPLOY: a tag purge
 * re-runs the emitter, but the emitter reads the value baked into the build.
 */

/** Parse a non-negative integer env value; anything else means "unset". */
function threshold(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Minimum products behind a colour option for its facet URL to be advertised.
 * `0` — the platform default — advertises every colour facet, which is what
 * every store does today.
 */
export const MIN_COLOUR_FACET_PRODUCTS = threshold(
  env.HEADKIT_SITEMAP_MIN_COLOUR_FACET_PRODUCTS,
);

/**
 * Minimum products behind a category-scoped brand for its facet URL to be
 * advertised. `0` — the platform default — advertises every brand facet.
 */
export const MIN_BRAND_FACET_PRODUCTS = threshold(
  env.HEADKIT_SITEMAP_MIN_BRAND_FACET_PRODUCTS,
);

/** The shape both `ProductFilters.brands[]` and `attributes[].options[]` have. */
export type FacetCountSource =
  | { slug?: string | null; count?: number | null }
  | null
  | undefined;

/**
 * True when a facet option has enough products behind it to advertise.
 *
 * An ABSENT count keeps the URL, deliberately. The same reasoning as
 * `shouldFallBackToGlobalBrands` in `lib/brand-facets.ts`: "this facet holds
 * one product" and "this backend does not report counts" are opposite
 * situations with opposite remedies, and a provider that reports no counts
 * (an older commerce deploy, a Shopify store) must not have its entire facet
 * family silently deleted from the sitemap. Only a count we actually observed
 * can drop a URL.
 */
export function meetsFacetThreshold(
  count: number | null | undefined,
  minimum: number,
): boolean {
  if (typeof count !== "number" || !Number.isFinite(count)) return true;
  return count >= minimum;
}

/** `meetsFacetThreshold` bound to the colour bar. */
export function keepsColourFacet(count: number | null | undefined): boolean {
  return meetsFacetThreshold(count, MIN_COLOUR_FACET_PRODUCTS);
}

/** `meetsFacetThreshold` bound to the brand bar. */
export function keepsBrandFacet(count: number | null | undefined): boolean {
  return meetsFacetThreshold(count, MIN_BRAND_FACET_PRODUCTS);
}

/**
 * Index a filter option list by slug so a count can be looked up for a slug
 * resolved elsewhere — `brandSlugsPerCategory` returns slugs only, having
 * already made the scoped-vs-global fallback decision on the unfiltered data.
 *
 * An empty map therefore means "counts unknowable for this category", which
 * `keepsBrandFacet` reads as keep. That is what preserves the global-brand
 * fallback: in that mode no slug has a count and every pair survives, exactly
 * as before this module existed.
 */
export function facetCountsBySlug(
  options: readonly FacetCountSource[] | null | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const option of options ?? []) {
    const slug = option?.slug ?? "";
    const count = option?.count;
    if (!slug || typeof count !== "number" || !Number.isFinite(count)) continue;
    counts.set(slug, count);
  }
  return counts;
}
