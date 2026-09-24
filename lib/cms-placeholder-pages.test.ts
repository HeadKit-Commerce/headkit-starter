import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreTheme } from "@/lib/store-theme";

/**
 * The placeholder list is ONE source of truth for `app/[...slug]` and
 * `app/sitemap.ts`, and it is extendable per store.
 *
 * `legal` is deliberately NOT a platform default: it is one store's own
 * WordPress parent slug, not something WooCommerce creates. The default set
 * carries only the pages WooCommerce publishes empty on every store.
 */

const STARTER_THEME: StoreTheme = {
  version: 1,
  layout: {
    navLayout: "left-logo",
    navStyle: "icons",
    heroLayout: "inset",
    homepageNav: "solid",
    productEnquiry: true,
  },
};

let theme: StoreTheme = STARTER_THEME;

vi.mock("@/lib/store-theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store-theme")>();
  return { ...actual, getStoreTheme: (): StoreTheme => theme };
});

const {
  cmsPlaceholderNotFound,
  cmsPlaceholderRedirects,
  cmsPlaceholderVerdict,
} = await import("./cms-placeholder-pages");

beforeEach(() => {
  theme = STARTER_THEME;
});

describe("the platform defaults", () => {
  it("carries only WooCommerce's own empty pages", () => {
    expect([...cmsPlaceholderNotFound()]).toEqual(["cart"]);
    expect(cmsPlaceholderRedirects()).toEqual({ "my-account": "/account" });
  });

  it("does not carry `legal`, which is one store's WordPress parent slug", () => {
    expect(cmsPlaceholderNotFound().has("legal")).toBe(false);
    expect(cmsPlaceholderVerdict("legal")).toBeNull();
  });

  it("only carries bare, single-segment slugs, so matching is exact", () => {
    for (const slug of [
      ...cmsPlaceholderNotFound(),
      ...Object.keys(cmsPlaceholderRedirects()),
    ]) {
      expect(slug).not.toMatch(/\//);
    }
  });

  it("keeps the not-found set and the redirect map disjoint", () => {
    for (const slug of cmsPlaceholderNotFound()) {
      expect(slug in cmsPlaceholderRedirects()).toBe(false);
    }
  });
});

describe("the verdict both consumers read", () => {
  it("404s a listed slug and redirects a mapped one", () => {
    expect(cmsPlaceholderVerdict("cart")).toEqual({ kind: "not-found" });
    expect(cmsPlaceholderVerdict("my-account")).toEqual({
      kind: "redirect",
      to: "/account",
    });
  });

  it("matches exactly, never as a prefix", () => {
    expect(cmsPlaceholderVerdict("cart/recover")).toBeNull();
    expect(cmsPlaceholderVerdict("my-account/orders")).toBeNull();
  });

  it("leaves every other slug to render", () => {
    expect(cmsPlaceholderVerdict("about")).toBeNull();
    expect(cmsPlaceholderVerdict("legal/privacy-policy")).toBeNull();
  });
});

describe("a store's own additions", () => {
  it("adds to the defaults rather than replacing them", () => {
    theme = {
      ...STARTER_THEME,
      cms: { placeholderNotFound: ["legal"] },
    };
    expect(cmsPlaceholderVerdict("legal")).toEqual({ kind: "not-found" });
    // Still exact, so the store's real children keep rendering.
    expect(cmsPlaceholderVerdict("legal/privacy-policy")).toBeNull();
    // And the platform default is untouched.
    expect(cmsPlaceholderVerdict("cart")).toEqual({ kind: "not-found" });
  });

  it("can add a redirect and retarget a default one", () => {
    theme = {
      ...STARTER_THEME,
      cms: {
        placeholderRedirects: {
          "my-account": "/account/orders",
          shop2: "/shop",
        },
      },
    };
    expect(cmsPlaceholderVerdict("my-account")).toEqual({
      kind: "redirect",
      to: "/account/orders",
    });
    expect(cmsPlaceholderVerdict("shop2")).toEqual({
      kind: "redirect",
      to: "/shop",
    });
  });

  it("resolves a slug listed both ways as not-found, the safer of the two", () => {
    theme = {
      ...STARTER_THEME,
      cms: {
        placeholderNotFound: ["offers"],
        placeholderRedirects: { offers: "/shop" },
      },
    };
    expect(cmsPlaceholderVerdict("offers")).toEqual({ kind: "not-found" });
  });
});
