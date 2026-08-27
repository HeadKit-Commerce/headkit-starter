import { describe, expect, it } from "vitest";
import {
  getStoreTheme,
  getThemeHtmlAttributes,
  heroLayoutClasses,
  heroMediaClasses,
  resetStoreThemeForTests,
} from "@/lib/store-theme";

describe("getStoreTheme", () => {
  it("loads velvet overrides theme.json", () => {
    resetStoreThemeForTests();
    const theme = getStoreTheme();
    expect(theme.layout.navLayout).toBe("centered-logo");
    expect(theme.layout.heroLayout).toBe("fixed-height");
    expect(theme.layout.homepageNav).toBe("overlay-hero");
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

describe("hero layout helpers", () => {
  it("returns inset margins by default", () => {
    expect(heroLayoutClasses("inset")).toContain("mx-5");
  });

  it("removes inset for full-bleed modes", () => {
    expect(heroLayoutClasses("full-bleed")).toContain("mx-0");
    expect(heroMediaClasses("fixed-height")).toContain("md:h-[850px]");
  });
});
