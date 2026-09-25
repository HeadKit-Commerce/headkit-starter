import { describe, expect, it } from "vitest";
import { legacyFacetRedirectPath } from "./legacy-facet-redirect";
import { decodeFilterSlug } from "./filter-slug";

/**
 * The 308 `proxy.ts` issues for a V1 facet query string. What matters is not
 * only that a facet folds into the path, but that a NON-facet query key never
 * does: the keys that arrive on these external links are overwhelmingly
 * campaign params, and folding one produces a URL that 200s on an empty grid.
 */
describe("legacyFacetRedirectPath", () => {
  it("folds a legacy attribute query into the path form", () => {
    const target = legacyFacetRedirectPath(
      "/collections/locks",
      "?pa_colour=black",
    );
    expect(target).toBe("/collections/locks/f/colour.black");
  });

  it("folds brands into the reserved brand group", () => {
    const target = legacyFacetRedirectPath(
      "/collections/locks",
      "?brands=abus,zipp",
    );
    expect(target).toBe("/collections/locks/f/brand.abus.zipp");
  });

  it("round-trips through the codec the route decodes with", () => {
    const target = legacyFacetRedirectPath(
      "/collections/locks",
      "?pa_colour=black,red&brands=abus",
    );
    const slug = target?.split("/f/")[1]?.split("?")[0] ?? "";
    expect(decodeFilterSlug(slug)).toEqual({
      attributes: { pa_colour: ["black", "red"] },
      brands: ["abus"],
    });
  });

  it("keeps collection state on the query string", () => {
    const target = legacyFacetRedirectPath(
      "/collections/locks",
      "?pa_colour=black&page=3&sort=PRICE&instock=true",
    );
    expect(target).toBe(
      "/collections/locks/f/colour.black?page=3&sort=PRICE&instock=true",
    );
  });

  it("carries unrecognised params through instead of folding them", () => {
    const target = legacyFacetRedirectPath(
      "/collections/locks",
      "?pa_colour=black&utm_source=newsletter&gclid=abc123",
    );
    expect(target).toBe(
      "/collections/locks/f/colour.black?utm_source=newsletter&gclid=abc123",
    );
  });

  it.each([
    ["a campaign-only query", "/collections/locks", "?utm_source=newsletter"],
    ["a click id", "/collections/locks", "?gclid=abc123"],
    ["Klaviyo's tracking param", "/collections/locks", "?_kx=xyz"],
    ["state-only query", "/collections/locks", "?page=2&sort=PRICE"],
    ["no query at all", "/collections/locks", ""],
    ["an empty facet value", "/collections/locks", "?pa_colour="],
  ])("leaves %s alone", (_label, pathname, search) => {
    expect(legacyFacetRedirectPath(pathname, search)).toBeNull();
  });

  it("never re-folds a URL that already carries a facet segment", () => {
    expect(
      legacyFacetRedirectPath(
        "/collections/locks/f/colour.black",
        "?pa_size=large",
      ),
    ).toBeNull();
  });

  it("ignores non-collection paths", () => {
    expect(legacyFacetRedirectPath("/shop", "?pa_colour=black")).toBeNull();
    expect(
      legacyFacetRedirectPath("/brand/abus", "?pa_colour=black"),
    ).toBeNull();
  });

  it("handles a nested category path and a trailing slash", () => {
    expect(
      legacyFacetRedirectPath("/collections/parts/locks/", "?pa_colour=black"),
    ).toBe("/collections/parts/locks/f/colour.black");
  });
});
