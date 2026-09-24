import { describe, expect, it, vi } from "vitest";

// Both bars come from `lib/env.ts`, which validates the whole environment at
// import. An EMPTY env is the case under test: it is what every store that has
// not set a bar has, and it must resolve to "cut nothing".
vi.mock("@/lib/env", () => ({ env: {} }));

import {
  MIN_BRAND_FACET_PRODUCTS,
  MIN_COLOUR_FACET_PRODUCTS,
  facetCountsBySlug,
  keepsBrandFacet,
  keepsColourFacet,
  meetsFacetThreshold,
} from "./facet-sitemap-thresholds";

/**
 * What this covers, and where it stops.
 *
 * COVERS: the pure rule — the shared predicate at an arbitrary bar, the "count
 * absent means keep" escape hatch, the slug→count index the sitemap uses for
 * brands, and that the PLATFORM DEFAULT of both bars is no cut at all.
 *
 * DOES NOT COVER: whether `app/sitemap.ts` actually calls any of it, which
 * facet families exist, or that `ProductFilterOption.count` is populated by the
 * backend. The emitter half is `app/sitemap.ts`'s own "thin facet cut" block in
 * `app/sitemap.test.ts`; a green file here says nothing about the sitemap.
 *
 * It also does NOT exercise a store that has SET either env value. Both
 * constants are resolved once at module load from `lib/env.ts`, so a per-test
 * override would have to re-import the module under a mutated environment; the
 * bar-crossing behaviour that would prove is exactly what
 * `meetsFacetThreshold` is asserted on directly below, at bars nobody has to
 * configure to reach.
 */
describe("facet sitemap thresholds", () => {
  it("defaults BOTH bars to no cut, so today's sitemap is unchanged", () => {
    // The platform default. The numbers that make a cut worthwhile (one
    // measured store chose colour 3 / brand 2) are a property of that
    // catalogue, so they are per-store env values and not baked in here.
    expect(MIN_COLOUR_FACET_PRODUCTS).toBe(0);
    expect(MIN_BRAND_FACET_PRODUCTS).toBe(0);

    // Every count a facet option can carry survives the default bar, including
    // the singleton and the zero.
    for (const count of [0, 1, 2, 3, 322]) {
      expect(keepsColourFacet(count)).toBe(true);
      expect(keepsBrandFacet(count)).toBe(true);
    }
  });

  it("keeps a facet AT the bar and drops the one below it", () => {
    expect(meetsFacetThreshold(3, 3)).toBe(true);
    expect(meetsFacetThreshold(2, 3)).toBe(false);
    expect(meetsFacetThreshold(0, 3)).toBe(false);
    // The two bars a store may set independently: at 3 a two-product colour is
    // thin, at 2 a two-product brand is not. Collapsing them to one number is
    // the change these two lines assert against.
    expect(meetsFacetThreshold(2, 3)).toBe(false);
    expect(meetsFacetThreshold(2, 2)).toBe(true);
  });

  it("keeps a facet whose count the backend did not report, at ANY bar", () => {
    // A provider that reports no counts must not have its facet family deleted
    // — only an observed count can drop a URL. This is also what keeps the
    // global-brand fallback in lib/brand-facets.ts intact.
    for (const absent of [undefined, null, Number.NaN]) {
      expect(meetsFacetThreshold(absent, 3)).toBe(true);
      expect(keepsColourFacet(absent)).toBe(true);
      expect(keepsBrandFacet(absent)).toBe(true);
    }
  });

  describe("facetCountsBySlug", () => {
    it("indexes reported counts by slug", () => {
      const counts = facetCountsBySlug([
        { slug: "scott", count: 98 },
        { slug: "factor", count: 1 },
      ]);
      expect(counts.get("scott")).toBe(98);
      expect(counts.get("factor")).toBe(1);
    });

    it("omits rows with no slug or no usable count, and reads absent as unknown", () => {
      const counts = facetCountsBySlug([
        null,
        { slug: "", count: 9 },
        { slug: "no-count" },
        { slug: "nan-count", count: Number.NaN },
      ]);
      expect(counts.size).toBe(0);
      // An omitted slug is "unknown", not "zero" — it survives any bar.
      expect(meetsFacetThreshold(counts.get("no-count"), 2)).toBe(true);
    });

    it("returns an empty map for an absent list", () => {
      expect(facetCountsBySlug(null).size).toBe(0);
      expect(facetCountsBySlug(undefined).size).toBe(0);
    });
  });
});
