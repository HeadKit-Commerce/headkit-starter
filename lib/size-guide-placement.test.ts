import { describe, expect, it } from "vitest";
import { themeSizeGuidePlacement } from "@/lib/size-guide-placement";

describe("themeSizeGuidePlacement", () => {
  it("returns none when the theme has no Size Guide path", () => {
    expect(
      themeSizeGuidePlacement({
        sizeGuideHref: undefined,
        showMultiAdd: true,
        hasSwatchAttribute: true,
        hasSizeAttribute: true,
      }),
    ).toBe("none");
  });

  it("prefers Complete the set when multi-add is active", () => {
    expect(
      themeSizeGuidePlacement({
        sizeGuideHref: "/size-guide",
        showMultiAdd: true,
        hasSwatchAttribute: true,
        hasSizeAttribute: false,
      }),
    ).toBe("multi-add");
  });

  it("uses the colour row on Bundles and other non-multi-add PDPs", () => {
    expect(
      themeSizeGuidePlacement({
        sizeGuideHref: "/size-guide",
        showMultiAdd: false,
        hasSwatchAttribute: true,
        hasSizeAttribute: false,
      }),
    ).toBe("swatch");
  });

  it("falls back to the size attribute when there is no colour row", () => {
    expect(
      themeSizeGuidePlacement({
        sizeGuideHref: "/size-guide",
        showMultiAdd: false,
        hasSwatchAttribute: false,
        hasSizeAttribute: true,
      }),
    ).toBe("size");
  });

  it("stands alone when there are no variation attributes", () => {
    expect(
      themeSizeGuidePlacement({
        sizeGuideHref: "/size-guide",
        showMultiAdd: false,
        hasSwatchAttribute: false,
        hasSizeAttribute: false,
      }),
    ).toBe("standalone");
  });
});
