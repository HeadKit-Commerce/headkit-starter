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
const menuGetMenus = vi.fn<(locations: string[]) => Promise<unknown>>();
const contentGet = vi.fn<(slug: string, type: string) => Promise<unknown>>();
const cacheLife = vi.fn<(profile: string) => void>();
const cacheTag = vi.fn<(...tags: string[]) => void>();
const collectionsGetCategories = vi.fn<() => Promise<unknown[]>>();
const collectionsGetFilters = vi.fn<(slug: string) => Promise<unknown>>();
const brandsList = vi.fn<() => Promise<unknown>>();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (profile: string): void => cacheLife(profile),
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { enableSitemap: true, allowIndexing: true },
      storeSettings: { name: "Acme", domain: null },
    }),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: (...a: unknown[]): unknown => productsList(...a) },
    // Every other section is emptied so the assertions below see only the
    // product sitemap.
    collections: {
      getCategories: (): Promise<unknown[]> => collectionsGetCategories(),
      getFilters: (slug: string): Promise<unknown> =>
        collectionsGetFilters(slug),
    },
    brands: { list: (): Promise<unknown> => brandsList() },
    posts: {
      list: (): Promise<unknown> => Promise.resolve({ posts: [] }),
      getLanding: (): Promise<null> => Promise.resolve(null),
    },
    projects: {
      list: (): Promise<unknown> => Promise.resolve({ projects: [] }),
    },
    menu: {
      getMenus: (locations: string[]): Promise<unknown> =>
        menuGetMenus(locations),
    },
    content: {
      get: (slug: string, type: string): Promise<unknown> =>
        contentGet(slug, type),
    },
  },
}));

import { KNOWN_MENU_LOCATIONS } from "@/lib/cache-tags";
import { decodeFilterSlug } from "@/components/headkit-ui/collection/utils";
import sitemap from "./sitemap";
import { uriToRelativePath } from "./shop/shop-slug";

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
  menuGetMenus.mockReset();
  contentGet.mockReset();
  collectionsGetCategories.mockReset();
  collectionsGetFilters.mockReset();
  brandsList.mockReset();
  // Default: no menus, so the WordPress-page section is empty and the
  // product assertions below see only product entries.
  menuGetMenus.mockResolvedValue([]);
  contentGet.mockResolvedValue(null);
  collectionsGetCategories.mockResolvedValue([]);
  collectionsGetFilters.mockResolvedValue({ attributes: [] });
  brandsList.mockResolvedValue({ brands: [] });
  cacheLife.mockClear();
  cacheTag.mockClear();
});

describe("sitemap Cache Components contract", () => {
  it("caches the assembled sitemap at cacheLife('days') with catalogue tags", async () => {
    productsList.mockResolvedValue({ products: [], totalPages: 0 });
    await sitemap();

    expect(cacheLife).toHaveBeenCalledWith("days");
    // Nested getPostsBasePath also uses cacheLife("hours") — the assembled
    // sitemap entry itself must stay on "days".
    expect(cacheLife).not.toHaveBeenCalledWith("max");
    // headkit:pages is declared rather than left implicit: the nested
    // getPostsBasePath entry is tagged with it and Next propagates a nested
    // entry's tags outward, so the sitemap is subscribed either way.
    expect(cacheTag).toHaveBeenCalledWith(
      "headkit:products",
      "headkit:collections",
      "headkit:brands",
      "headkit:posts",
      "headkit:projects",
      "headkit:pages",
      "headkit:branding",
    );
  });
});

// The sitemap re-roots every product permalink under the storefront origin
// via `uriToRelativePath`; these cases pin that normalisation, which is what
// keeps an off-site entry (T-15.1-07-02) impossible by construction.
describe("product permalink normalisation (uriToRelativePath)", () => {
  it("returns a site-relative permalink unchanged", () => {
    expect(
      uriToRelativePath("/shop/clothing/blue-hoodie/"),
      "a permalink that is already relative needs no normalisation",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("strips the origin of an absolute permalink", () => {
    expect(
      uriToRelativePath(
        "https://commerce.example.com/shop/clothing/blue-hoodie/",
      ),
      "the WordPress origin must not survive into the sitemap — every entry is re-rooted under the storefront's own site url",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("keeps only the path of a FOREIGN origin, never the origin itself", () => {
    // The threat (T-15.1-07-02) is an off-site sitemap entry. It is closed by
    // construction: the origin is discarded, so the caller can only ever emit
    // a URL beneath SITE_URL. An origin-EQUALITY test would instead have
    // rejected every product in every headless store, because WordPress runs
    // on a different host from the storefront by design.
    const path = uriToRelativePath("https://attacker.example/shop/x");
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
      uriToRelativePath("//attacker.example/shop/x"),
      "a protocol-relative permalink is path-like but resolves off-site when joined to a base url — it must yield null",
    ).toBeNull();
  });

  it("returns null for empty or unparseable input", () => {
    expect(uriToRelativePath(""), "empty permalink yields no path").toBeNull();
    expect(
      uriToRelativePath("javascript:alert(1)"),
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

  it("emits tier-one colourway URLs beneath the product's canonical path", async () => {
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
      "a colourway is one segment on whichever base won, so a nested product's colourways are nested too — advertising /products/{slug}/{colour} would point the sitemap at URLs the storefront redirects. Duplicate colour slugs stay de-duplicated.",
    ).toEqual([
      `${SITE_URL}/shop/clothing/blue-hoodie`,
      `${SITE_URL}/shop/clothing/blue-hoodie/red`,
      `${SITE_URL}/shop/clothing/blue-hoodie/blue`,
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

/**
 * WordPress pages in the sitemap.
 *
 * The sitemap built from products, collections, brands, posts, projects and a
 * hardcoded static list — there was NO source for CMS pages at all, so `/about`
 * and the legal pages were absent even with the sitemap switched on. The schema
 * has no "list pages" query (`content()` resolves one node by slug), so the
 * navigation menus are the discovery source and `content(type: PAGE)` is the
 * existence check, preserving the rule that the sitemap only ever advertises
 * URLs that actually serve.
 */
describe("WordPress page sitemap section", () => {
  function menu(...uris: string[]): Record<string, unknown> {
    return {
      name: "m",
      description: null,
      items: uris.map((uri) => ({ uri })),
    };
  }

  async function pageUrls(): Promise<string[]> {
    productsList.mockResolvedValue({ products: [], totalPages: 0 });
    const entries = await sitemap();
    return entries.map((e) => e.url).filter((u) => !STATIC_URLS.has(u));
  }

  it("discovers from every menu location WordPress can populate", async () => {
    // The sitemap and the cache-tag fan-out must agree on the location list:
    // a location added for one and not the other leaves pages linked only
    // there undiscovered, with no error to show for it.
    menuGetMenus.mockResolvedValue([]);
    productsList.mockResolvedValue({ products: [], totalPages: 0 });
    await sitemap();

    expect(menuGetMenus).toHaveBeenCalledWith([...KNOWN_MENU_LOCATIONS]);
  });

  it("emits menu-linked CMS pages that exist, including nested paths", async () => {
    menuGetMenus.mockResolvedValue([
      menu("https://wp.example.com/about/", "/legal/privacy-policy"),
    ]);
    contentGet.mockResolvedValue({ slug: "x" });

    await expect(pageUrls()).resolves.toEqual([
      `${SITE_URL}/about`,
      `${SITE_URL}/legal/privacy-policy`,
    ]);
    // The WP host is discarded — only the path survives, re-rooted on the site.
    expect(contentGet).toHaveBeenCalledWith("about", "PAGE");
    expect(contentGet).toHaveBeenCalledWith("legal/privacy-policy", "PAGE");
  });

  it("omits a menu link that is not a published page", async () => {
    menuGetMenus.mockResolvedValue([menu("/about", "/never-published")]);
    contentGet.mockImplementation((slug: string) =>
      Promise.resolve(slug === "about" ? { slug } : null),
    );

    await expect(
      pageUrls(),
      "advertising a URL that answers not-found is a Search Console error",
    ).resolves.toEqual([`${SITE_URL}/about`]);
  });

  it("skips links owned by other route trees and other sitemap sections", async () => {
    menuGetMenus.mockResolvedValue([
      menu(
        "/shop",
        "/shop/clothing/hoodie",
        "/collections/dish-brushes",
        "/products/gold-package",
        "/brand/dishee",
        "/projects/case-study",
        "/news/some-post",
        "/search",
        "/cart",
        "/account/orders",
        "#",
        "tel:1300883919",
        "mailto:hi@acme.test",
      ),
    ]);
    contentGet.mockResolvedValue({ slug: "x" });

    await expect(pageUrls()).resolves.toEqual([]);
    expect(
      contentGet,
      "non-page routes must not even be probed",
    ).not.toHaveBeenCalled();
  });

  it("drops an external http link without probing it as a CMS page", async () => {
    // Social / off-site absolute menu URIs stay absolute in convertToRelativePath
    // (so InstantLink can open them off-site). menuItemPath then rejects them via
    // isAppNavigationHref — they must never become a storefront <loc>, and they
    // must not burn a content(PAGE) probe on a fake slug like "acme".
    menuGetMenus.mockResolvedValue([menu("https://instagram.com/acme")]);
    contentGet.mockResolvedValue(null);

    await expect(pageUrls()).resolves.toEqual([]);
    expect(contentGet).not.toHaveBeenCalled();
  });

  it("does not restate a page that is already a static entry, and does not probe it", async () => {
    menuGetMenus.mockResolvedValue([menu("/contact", "/faq")]);
    contentGet.mockResolvedValue({ slug: "x" });

    productsList.mockResolvedValue({ products: [], totalPages: 0 });
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls.filter((u) => u === `${SITE_URL}/contact`)).toHaveLength(1);
    expect(urls.filter((u) => u === `${SITE_URL}/faq`)).toHaveLength(1);
    // Each probe is a FULL page payload through the SDK's 4-slot read
    // semaphore on the uncached cold build. Spending one on a path the static
    // section already emits — and the final dedupe then drops — is pure cost,
    // and /contact and /faq are exactly what a footer menu links.
    expect(
      contentGet,
      "a menu link to a route the sitemap already emits must not be probed",
    ).not.toHaveBeenCalled();
  });

  it("walks child menu items, and deduplicates a page linked twice", async () => {
    menuGetMenus.mockResolvedValue([
      {
        name: "m",
        description: null,
        items: [
          { uri: "#", children: [{ uri: "/weddings/" }, { uri: "/weddings" }] },
        ],
      },
    ]);
    contentGet.mockResolvedValue({ slug: "x" });

    await expect(pageUrls()).resolves.toEqual([`${SITE_URL}/weddings`]);
  });

  it("degrades to no page entries when the menu read fails", async () => {
    menuGetMenus.mockRejectedValue(new Error("gateway unreachable"));

    await expect(
      pageUrls(),
      "a menu failure must not throw and fail the whole sitemap",
    ).resolves.toEqual([]);
  });
});

describe("category color facet key", () => {
  // Before the fix, the sitemap's colorFilterSlug hard-coded `pa_color`, so a
  // store whose colour taxonomy is `pa_colour` advertised a facet URL that
  // decoded to an attribute key its own taxonomy does not have (report §7.4).
  async function collectionUrls(): Promise<string[]> {
    const entries = await sitemap();
    return entries
      .map((e) => e.url)
      .filter((u) => u.includes("/collections/") && u.includes("/f/"));
  }

  it("emits a facet URL keyed by the store's own attribute slug (pa_colour)", async () => {
    collectionsGetCategories.mockResolvedValue([
      { slug: "bikes", children: [] },
    ]);
    // SDK getFilters() returns the display slug with the `pa_` prefix
    // stripped (see lib/color-attr-slug.ts) — not the raw taxonomy name.
    collectionsGetFilters.mockResolvedValue({
      attributes: [
        { slug: "colour", options: [{ slug: "black", name: "Black" }] },
      ],
    });

    const urls = await collectionUrls();
    expect(urls).toHaveLength(1);
    const facetSegment = new URL(urls[0]!).pathname.split("/f/")[1]!;

    expect(decodeFilterSlug(facetSegment).attributes).toEqual({
      pa_colour: ["black"],
    });
  });

  it("still emits pa_color correctly for a store spelled that way", async () => {
    collectionsGetCategories.mockResolvedValue([
      { slug: "bikes", children: [] },
    ]);
    collectionsGetFilters.mockResolvedValue({
      attributes: [
        { slug: "color", options: [{ slug: "black", name: "Black" }] },
      ],
    });

    const urls = await collectionUrls();
    expect(urls).toHaveLength(1);
    const facetSegment = new URL(urls[0]!).pathname.split("/f/")[1]!;

    expect(decodeFilterSlug(facetSegment).attributes).toEqual({
      pa_color: ["black"],
    });
  });
});
