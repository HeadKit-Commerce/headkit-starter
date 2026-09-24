import { describe, expect, it } from "vitest";
import {
  getStoreTheme,
  getThemeHtmlAttributes,
  heroLayoutClasses,
  heroMediaClasses,
  parseStoreTheme,
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
    expect(theme.cart).toBeUndefined();
    expect(theme.layout.productEnquiry).toBe(true);
  });
});

const LAYOUT = {
  navLayout: "left-logo" as const,
  navStyle: "icons" as const,
  heroLayout: "inset" as const,
  homepageNav: "solid" as const,
  productEnquiry: true,
};

describe("parseStoreTheme cart", () => {
  it("reads an opt-in packaging and gift message config", () => {
    const theme = parseStoreTheme({
      version: 1,
      layout: LAYOUT,
      cart: {
        packaging: {
          title: "Packaging choice",
          options: [
            {
              id: "signature-box",
              title: "The Signature Box",
              description:
                "The textured Velvet box, with the signature and the icon cut through the lid, in a colour matched to your towel.",
              image: "",
            },
            {
              id: "sustainable-box",
              title: "The Sustainable Box",
              description:
                "Your order arrives in a recyclable kraft case, lighter to ship and made to be reused.",
              image: "https://cdn.example.com/kraft.jpg",
            },
          ],
        },
        giftMessage: { label: "Include a complimentary gift message?" },
      },
    });
    expect(
      theme.cart?.packaging?.options.map((option) => option.title),
    ).toEqual(["The Signature Box", "The Sustainable Box"]);
    expect(theme.cart?.packaging?.options[0]?.image).toBeUndefined();
    expect(theme.cart?.packaging?.options[1]?.image).toBe(
      "https://cdn.example.com/kraft.jpg",
    );
    expect(theme.cart?.giftMessage?.label).toBe(
      "Include a complimentary gift message?",
    );
  });

  it("reads an optional posts-index title", () => {
    const theme = parseStoreTheme({
      version: 1,
      layout: LAYOUT,
      copy: { postsIndex: { title: "Journal" } },
    });
    expect(theme.copy?.postsIndex?.title).toBe("Journal");
    expect(theme.copy?.postsIndex?.description).toBeUndefined();
  });

  it("reads an optional empty-cart sentence", () => {
    const theme = parseStoreTheme({
      version: 1,
      layout: LAYOUT,
      cart: { emptyMessage: "The cart is empty." },
    });
    expect(theme.cart?.emptyMessage).toBe("The cart is empty.");
    expect(theme.cart?.packaging).toBeUndefined();
  });

  it("falls back to starter defaults when cart config is invalid", () => {
    const theme = parseStoreTheme({
      version: 1,
      layout: LAYOUT,
      cart: { packaging: { title: "Packaging choice", options: [] } },
    });
    expect(theme.layout.navLayout).toBe("left-logo");
    expect(theme.cart).toBeUndefined();
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

describe("hero layout helpers", () => {
  it("returns inset margins by default", () => {
    expect(heroLayoutClasses("inset")).toContain("mx-5");
  });

  it("removes inset for full-bleed modes", () => {
    expect(heroLayoutClasses("full-bleed")).toContain("mx-0");
    expect(heroMediaClasses("fixed-height")).toContain("md:h-[850px]");
  });
});
