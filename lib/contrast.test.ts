import { describe, expect, it } from "vitest";

import {
  MIN_CONTRAST_RATIO,
  contrastRatio,
  relativeLuminance,
  resolveOnPrimaryTextColor,
} from "./contrast";

/** Dishee's live primary — a light mint. */
const MINT_PRIMARY = "#89cfc2";
const WHITE_BACKGROUND = "#ffffff";

describe("resolveOnPrimaryTextColor", () => {
  it("does NOT return the background for a light primary on a light background", () => {
    const resolved = resolveOnPrimaryTextColor(MINT_PRIMARY, WHITE_BACKGROUND);

    expect(
      resolved,
      "mint primary + white background was the unconditional alias that produced ~1.7:1 on every filled CTA",
    ).not.toBe(WHITE_BACKGROUND);

    const ratio = contrastRatio(resolved, MINT_PRIMARY);
    expect(ratio).not.toBeNull();
    expect(
      ratio ?? 0,
      `the chosen on-primary colour must clear ${MIN_CONTRAST_RATIO}:1 against the primary`,
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it("returns the background UNCHANGED for a dark primary on a light background", () => {
    expect(
      resolveOnPrimaryTextColor("#111111", WHITE_BACKGROUND),
      "the override is conditional — palettes the old rule was correct for must not regress",
    ).toBe(WHITE_BACKGROUND);
    expect(
      resolveOnPrimaryTextColor("#7f54b3", WHITE_BACKGROUND),
      "the default Woo purple primary must keep the background as on-primary text",
    ).toBe(WHITE_BACKGROUND);
  });

  it("returns the background unchanged for an absent or non-hex primary", () => {
    expect(
      resolveOnPrimaryTextColor(null, WHITE_BACKGROUND),
      "an absent brand value must leave existing behaviour untouched, not throw",
    ).toBe(WHITE_BACKGROUND);
    expect(
      resolveOnPrimaryTextColor("rgb(137, 207, 194)", WHITE_BACKGROUND),
      "safeColor also admits rgb() — a non-hex value must degrade, not throw",
    ).toBe(WHITE_BACKGROUND);
  });

  it("picks white over black when the primary is dark but the background is also dark", () => {
    const resolved = resolveOnPrimaryTextColor("#1a1a1a", "#000000");
    expect(resolved).toBe("#ffffff");
    expect(contrastRatio(resolved, "#1a1a1a") ?? 0).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO,
    );
  });
});

describe("relativeLuminance / contrastRatio", () => {
  it("anchors on the WCAG reference values", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 3);
  });

  it("expands 3-digit hex and ignores an alpha pair", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#ffffff80")).toBeCloseTo(1, 5);
  });

  it("returns null for a non-hex value rather than a wrong number", () => {
    expect(relativeLuminance("rgb(255,255,255)")).toBeNull();
    expect(relativeLuminance("#12345")).toBeNull();
    expect(relativeLuminance("#gggggg")).toBeNull();
    expect(contrastRatio("#ffffff", "not-a-colour")).toBeNull();
  });

  it("scores the mint primary against white below the AA floor — the defect this fixes", () => {
    const ratio = contrastRatio(WHITE_BACKGROUND, MINT_PRIMARY) ?? 0;
    expect(ratio).toBeLessThan(MIN_CONTRAST_RATIO);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2);
  });
});
