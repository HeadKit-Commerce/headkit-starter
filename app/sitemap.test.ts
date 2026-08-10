import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Product sitemap — D-15-04.
 *
 * The sitemap must advertise the URLs the site actually SERVES. Before this
 * change it synthesised `${SITE_URL}/products/${slug}` for every product,
 * which contradicted the nested `/shop/{cat}[/{sub}]/{slug}` URLs live stores
 * have indexed and which `app/shop/[...slug]` now serves.
 *
 * The normalisation happens at this consumer boundary on purpose: the Go
 * product mapper assigns the ABSOLUTE WooCommerce permalink to `uri`, a field
 * the schema documents as relative, and correcting that upstream is explicitly
 * deferred (15.1-CONTEXT `<deferred>`).
 */

const { SITE_URL } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url };
});

const productsList = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { enableSitemap: true, allowIndexing: true },
      storeSettings: { name: "Acme" },
    }),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: (...a: unknown[]): unknown => productsList(...a) },
    // Every other section is emptied so the assertions below see only the
    // product sitemap.
    collections: {
      getCategories: (): Promise<unknown[]> => Promise.resolve([]),
      getFilters: (): Promise<unknown> => Promise.resolve({ attributes: [] }),
    },
    brands: { list: (): Promise<unknown> => Promise.resolve({ brands: [] }) },
    posts: { list: (): Promise<unknown> => Promise.resolve({ posts: [] }) },
    projects: {
      list: (): Promise<unknown> => Promise.resolve({ projects: [] }),
    },
  },
}));

import sitemap, { toSitemapPath } from "./sitemap";

function product(
  slug: string,
  uri: string,
  colors: string[] = [],
): Record<string, unknown> {
  return {
    slug,
    uri,
    attributes: colors.length
      ? [
          {
            slug: "pa_color",
            fullOptions: colors.map((c) => ({ slug: c })),
          },
        ]
      : [],
  };
}

async function productUrls(): Promise<string[]> {
  const entries = await sitemap();
  return entries.map((e) => e.url).filter((u) => !STATIC_URLS.has(u));
}

// The static-page block is unchanged by this plan; exclude it from assertions.
const STATIC_URLS = new Set(
  [
    "",
    "/shop",
    "/brand",
    "/news",
    "/projects",
    "/faq",
    "/contact",
    "/sale",
    "/new",
    "/featured",
    "/search",
  ].map((p) => `${SITE_URL}${p}`),
);

beforeEach(() => {
  productsList.mockReset();
});

describe("toSitemapPath", () => {
  it("returns a site-relative permalink unchanged", () => {
    expect(
      toSitemapPath("/shop/clothing/blue-hoodie/"),
      "a permalink that is already relative needs no normalisation",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("strips the origin of an absolute permalink", () => {
    expect(
      toSitemapPath("https://commerce.example.com/shop/clothing/blue-hoodie/"),
      "the WordPress origin must not survive into the sitemap — every entry is re-rooted under the storefront's own site url",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("keeps only the path of a FOREIGN origin, never the origin itself", () => {
    // The threat (T-15.1-07-02) is an off-site sitemap entry. It is closed by
    // construction: the origin is discarded, so the caller can only ever emit
    // a URL beneath SITE_URL. An origin-EQUALITY test would instead have
    // rejected every product in every headless store, because WordPress runs
    // on a different host from the storefront by design.
    const path = toSitemapPath("https://attacker.example/shop/x");
    expect(
      path,
      "a foreign origin must be discarded, not propagated — an off-site sitemap entry is worse than a missing one",
    ).toBe("/shop/x");
    expect(
      path?.startsWith("http"),
      "the returned value must never be an absolute url",
    ).toBe(false);
  });

  it("rejects a protocol-relative permalink outright", () => {
    expect(
      toSitemapPath("//attacker.example/shop/x"),
      "a protocol-relative permalink is path-like but resolves off-site when joined to a base url — it must yield null",
    ).toBeNull();
  });

  it("returns null for empty or unparseable input", () => {
    expect(toSitemapPath(""), "empty permalink yields no path").toBeNull();
    expect(
      toSitemapPath("javascript:alert(1)"),
      "a non-http scheme yields no path",
    ).toBeNull();
  });
});

describe("makeProductSitemap", () => {
  it("emits each product at its own permalink path, not a synthesised flat path", async () => {
    productsList.mockResolvedValue({
      products: [
        product(
          "blue-hoodie",
          "https://commerce.example.com/shop/clothing/hoodies/blue-hoodie/",
        ),
        product("cap", "/shop/accessories/cap/"),
      ],
      totalPages: 1,
    });

    const urls = await productUrls();

    expect(
      urls,
      "the sitemap must advertise the nested URLs the store has indexed and app/shop/[...slug] now serves",
    ).toEqual([
      `${SITE_URL}/shop/clothing/hoodies/blue-hoodie`,
      `${SITE_URL}/shop/accessories/cap`,
    ]);
    expect(
      urls.includes(`${SITE_URL}/products/blue-hoodie`),
      "no synthesised flat product URL may be emitted when a shop permalink was available",
    ).toBe(false);
  });

  it("never emits a url outside the site origin", async () => {
    productsList.mockResolvedValue({
      products: [
        product("hijack", "https://attacker.example/shop/hijack/"),
        product("proto", "//attacker.example/shop/proto/"),
      ],
      totalPages: 1,
    });

    const urls = await productUrls();

    expect(
      urls.every((u) => u.startsWith(`${SITE_URL}/`)),
      "every emitted url must be beneath the storefront origin — this is the mitigation for T-15.1-07-02",
    ).toBe(true);
    expect(
      urls.some((u) => u.includes("attacker.example")),
      "no attacker-influenceable origin may reach the published sitemap",
    ).toBe(false);
  });

  it("falls back to the always-served flat path when the permalink is unusable or off-base", async () => {
    productsList.mockResolvedValue({
      products: [
        // A store on WooCommerce's default /product/ permalink base: this app
        // has NO route serving that path, so advertising it would publish a
        // 404. The flat /products/{slug} route always serves.
        product("off-base", "https://commerce.example.com/product/off-base/"),
        product("no-uri", ""),
      ],
      totalPages: 1,
    });

    const urls = await productUrls();

    expect(
      urls,
      "a product whose permalink is not under /shop must keep today's flat URL — skipping it would empty the product sitemap of every store that does not use the shop permalink base",
    ).toEqual([`${SITE_URL}/products/off-base`, `${SITE_URL}/products/no-uri`]);
  });

  it("emits tier-one colourway URLs beneath the served flat product path", async () => {
    productsList.mockResolvedValue({
      products: [
        product(
          "blue-hoodie",
          "https://commerce.example.com/shop/clothing/blue-hoodie/",
          ["red", "blue", "red"],
        ),
      ],
      totalPages: 1,
    });

    const urls = await productUrls();

    expect(
      urls,
      "colourways stay beneath /products/{slug}, which serves them; the shop catch-all does not classify a colour segment, so nesting them there would advertise 404s. Duplicate colour slugs stay de-duplicated.",
    ).toEqual([
      `${SITE_URL}/shop/clothing/blue-hoodie`,
      `${SITE_URL}/products/blue-hoodie/red`,
      `${SITE_URL}/products/blue-hoodie/blue`,
    ]);
  });

  it("paginates to completion", async () => {
    productsList
      .mockResolvedValueOnce({
        products: [product("a", "/shop/clothing/a/")],
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        products: [product("b", "/shop/clothing/b/")],
        totalPages: 2,
      });

    const urls = await productUrls();

    expect(
      urls.length,
      "stopping after page 1 silently truncates the published catalogue",
    ).toBe(2);
  });

  it("returns no product entries when the catalogue read fails, and does not throw", async () => {
    productsList.mockRejectedValue(new Error("gateway unreachable"));

    await expect(
      productUrls(),
      "a catalogue failure must degrade to an empty product section, never throw and fail the whole sitemap",
    ).resolves.toEqual([]);
  });
});
