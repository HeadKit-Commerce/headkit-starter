/**
 * The prerender page/fill budget derivation.
 *
 * The important case is `undefined`: unset means `next.config.ts` writes
 * NEITHER key, which is not the same as writing Next's own default back — it
 * is what keeps this template's build identical to today's for every store.
 */
import { describe, expect, it } from "vitest";

import {
  NEXT_DEFAULT_PAGE_GENERATION_TIMEOUT_SECONDS,
  resolvePrerenderTimeout,
} from "@/lib/prerender-timeout";

describe("resolvePrerenderTimeout", () => {
  it("writes nothing when unset or empty", () => {
    expect(resolvePrerenderTimeout(undefined)).toBeUndefined();
    expect(resolvePrerenderTimeout("")).toBeUndefined();
  });

  it("writes both keys together, since raising one alone is inert", () => {
    // Next clamps the fill budget to `staticPageGenerationTimeout * 0.9`, so
    // `useCacheTimeout` on its own cannot move it.
    expect(resolvePrerenderTimeout("436")).toEqual({
      staticPageGenerationTimeout: 436,
      useCacheTimeout: 392,
    });
  });

  it("floors the fill budget so it stays below the page budget", () => {
    // 100 * 0.9 = 90 exactly; 101 * 0.9 = 90.9 must not round up past the
    // clamp, or Next silently holds it at its own derivation anyway.
    expect(resolvePrerenderTimeout("100")?.useCacheTimeout).toBe(90);
    expect(resolvePrerenderTimeout("101")?.useCacheTimeout).toBe(90);
  });

  it("ignores a value at or below Next's default", () => {
    // There is nothing to raise, and writing the keys anyway would only make
    // the config lie about being untouched.
    expect(
      resolvePrerenderTimeout(
        String(NEXT_DEFAULT_PAGE_GENERATION_TIMEOUT_SECONDS),
      ),
    ).toBeUndefined();
    expect(resolvePrerenderTimeout("30")).toBeUndefined();
  });

  it("ignores a value it cannot read rather than writing a 0s page budget", () => {
    expect(resolvePrerenderTimeout("soon")).toBeUndefined();
    expect(resolvePrerenderTimeout("-1")).toBeUndefined();
  });
});
