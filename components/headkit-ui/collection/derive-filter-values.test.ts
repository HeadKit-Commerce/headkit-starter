import { describe, expect, it } from "vitest";
import { deriveFilterValues, DEFAULT_FILTER_VALUES } from "./utils";
import type { ProductFilters } from "@headkit/sdk";

/**
 * `deriveFilterValues` is the whole of what `CollectionProvider` used to do with
 * `useSearchParams()`. It is called twice per mount: once with an EMPTY query
 * string (the server's view — the provider renders in the static shell and may
 * not perform a request-time read), and once from the mount effect with the
 * real `window.location.search`.
 *
 * WHAT THIS COVERS: the pure function only — its precedence rules, and that two
 * calls do not contaminate each other.
 *
 * WHERE IT STOPS: it does not exercise the provider, the effects, or the
 * correction itself. Whether a `?page=`/`?sort=`/`?colour=` URL actually
 * corrects after hydration is browser-observable ONLY and is not asserted
 * anywhere in this repo; whether the route still renders in the static shell is
 * `app/shop/[...slug]/page.composition.test.tsx` plus a built-file measurement
 * (`bun run scripts/static-shell-split.ts`).
 */

const productFilter = {
  attributes: [{ id: "0", name: "Colour", slug: "colour", options: [] }],
} as unknown as ProductFilters;

const base = { initialPage: 1, productFilter };

describe("deriveFilterValues", () => {
  it("returns the prop-seeded defaults for an empty query string", () => {
    const vals = deriveFilterValues(new URLSearchParams(), base);
    expect(vals).toEqual({ ...DEFAULT_FILTER_VALUES, page: 1 });
  });

  it("reads the query state the server no longer renders", () => {
    const vals = deriveFilterValues(
      new URLSearchParams(
        "page=3&sort=PRICE&instock=true&price_min=10&price_max=99&categories=a,b",
      ),
      base,
    );
    expect(vals.page).toBe(3);
    expect(vals.sort).toBe("PRICE");
    expect(vals.instock).toBe(true);
    expect(vals.price_min).toBe("10");
    expect(vals.price_max).toBe("99");
    expect(vals.categories).toEqual(["a", "b"]);
  });

  it("reads a LEGACY query facet off the store's own attribute slug", () => {
    const vals = deriveFilterValues(
      new URLSearchParams("colour=bead-blast-black"),
      base,
    );
    expect(vals.attributes).toEqual({ colour: ["bead-blast-black"] });
  });

  it("lets the path-decoded facet beat the legacy query form", () => {
    const vals = deriveFilterValues(
      new URLSearchParams("colour=red&brands=acme"),
      {
        ...base,
        initialFilterValues: { pa_colour: ["blue"] },
        initialBrands: ["velocity"],
      },
    );
    expect(vals.attributes).toEqual({ pa_colour: ["blue"] });
    expect(vals.brands).toEqual(["velocity"]);
  });

  // The regression this file exists for. Spreading DEFAULT_FILTER_VALUES copies
  // the REFERENCE to its `attributes` object; writing a legacy facet into it
  // mutated the module-level default, so the mount correction compared the
  // seeded values against the corrected ones and found the SAME object — and a
  // `?colour=` URL silently stopped folding into `/f/colour.<value>`.
  it("never mutates DEFAULT_FILTER_VALUES, so two calls stay independent", () => {
    const seeded = deriveFilterValues(new URLSearchParams(), base);
    const corrected = deriveFilterValues(
      new URLSearchParams("colour=bead-blast-black"),
      base,
    );

    expect(DEFAULT_FILTER_VALUES.attributes).toEqual({});
    expect(seeded.attributes).toEqual({});
    expect(seeded.attributes).not.toBe(corrected.attributes);
    expect(corrected.attributes).toEqual({ colour: ["bead-blast-black"] });
  });
});
