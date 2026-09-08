import { describe, expect, it } from "vitest";
import {
  applyCartNoun,
  getStoreTheme,
  getThemeHtmlAttributes,
  heroLayoutClasses,
  heroMediaClasses,
  resetStoreThemeForTests,
} from "@/lib/store-theme";

describe("getStoreTheme", () => {
  it("loads starter default layout modes from overrides/theme.json", () => {
    resetStoreThemeForTests();
    const theme = getStoreTheme();
    expect(theme.layout.navLayout).toBe("left-logo");
    expect(theme.layout.navStyle).toBe("icons");
    expect(theme.layout.heroLayout).toBe("inset");
    expect(theme.layout.homepageNav).toBe("solid");
    expect(theme.pdp).toBeUndefined();
    expect(theme.catalog).toBeUndefined();
    expect(theme.copy).toBeUndefined();
    expect(theme.layout.productEnquiry).toBe(true);
  });
});

describe("getThemeHtmlAttributes", () => {
  it("maps layout modes to data attributes", () => {
    const attrs = getThemeHtmlAttributes({
      version: 1,
      layout: {
        navLayout: "centered-logo",
        navStyle: "text-labels",
        heroLayout: "fixed-height",
        homepageNav: "overlay-hero",
        productEnquiry: true,
      },
    });
    expect(attrs).toEqual({
      "data-nav-layout": "centered-logo",
      "data-nav-style": "text-labels",
      "data-hero-layout": "fixed-height",
      "data-homepage-nav": "overlay-hero",
    });
  });
});

describe("applyCartNoun", () => {
  const setTotalLabel = "Add set to cart · $120.00";

  it("leaves starter cart labels including the set total unchanged", () => {
    expect(applyCartNoun("Add to cart", undefined)).toBe("Add to cart");
    expect(applyCartNoun("Added to cart!", undefined)).toBe("Added to cart!");
    expect(applyCartNoun(setTotalLabel, undefined)).toBe(setTotalLabel);
    expect(applyCartNoun(setTotalLabel, "cart")).toBe(setTotalLabel);
  });

  it("swaps only the word cart for bag and keeps the set total", () => {
    expect(applyCartNoun("Add to cart", "bag")).toBe("Add to bag");
    expect(applyCartNoun("Added to cart!", "bag")).toBe("Added to bag!");
    expect(applyCartNoun(setTotalLabel, "bag")).toBe(
      "Add set to bag · $120.00",
    );
  });

  it("does not rewrite quote labels", () => {
    expect(applyCartNoun("Add to Quote", "bag")).toBe("Add to Quote");
    expect(applyCartNoun("Added to quote!", "bag")).toBe("Added to quote!");
    expect(applyCartNoun("Add set to quote · $120.00", "bag")).toBe(
      "Add set to quote · $120.00",
    );
  });
});

describe("hero layout helpers", () => {
  it("returns inset margins by default", () => {
    expect(heroLayoutClasses("inset")).toContain("mx-5");
  });

  it("removes inset for full-bleed modes", () => {
    expect(heroLayoutClasses("full-bleed")).toContain("mx-0");
    expect(heroMediaClasses("fixed-height")).toContain("md:h-[850px]");
  });
});
