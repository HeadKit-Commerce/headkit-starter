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
// The thin-facet cut's two predicates. Spied rather than driven by env because
// both bars are resolved once at module load; the emitter half under test here
// is "does app/sitemap.ts consult them, with the count the getFilters payload
// carried, and drop what they refuse" — the RULE is
// `lib/facet-sitemap-thresholds.test.ts`.
const keepsColourFacet = vi.fn<(count: unknown) => boolean>();
const keepsBrandFacet = vi.fn<(count: unknown) => boolean>();

vi.mock("server-only", () => ({}));

// `app/sitemap.ts` reads the thin-facet bars through `lib/env.ts`, which
// validates the whole environment at import; an empty object is the
// "no bar configured" case, i.e. today's sitemap.
vi.mock("@/lib/env", () => ({ env: {} }));

vi.mock("@/lib/facet-sitemap-thresholds", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/facet-sitemap-thresholds")>();
  return {
    ...actual,
    keepsColourFacet: (count: unknown): boolean => keepsColourFacet(count),
    keepsBrandFacet: (count: unknown): boolean => keepsBrandFacet(count),
  };
});

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
import { meetsFacetThreshold } from "@/lib/facet-sitemap-thresholds";
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
  keepsColourFacet.mockReset();
  keepsBrandFacet.mockReset();
  // Default: the platform bars, which cut nothing. Every existing assertion in
  // this file predates the thin-facet cut and must keep seeing every facet.
  keepsColourFacet.mockReturnValue(true);
  keepsBrandFacet.mockReturnValue(true);
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

describe("category×brand facet emptiness", () => {
  // The sitemap builds this family alongside generateStaticParams. If the two
  // disagree the sitemap advertises URLs the build never prerendered, so the
  // rule lives in lib/brand-facets.ts and both call it — this is the sitemap
  // half of the same regression (report §7.1, §8).
  const GLOBAL_BRANDS = {
    brands: [
      { slug: "shimano" },
      { slug: "abus" },
      { slug: "basil" },
      { slug: "4iiii" },
    ],
  };

  /** `{category, brand}` for every collection facet URL that carries a brand. */
  async function brandFacets(): Promise<{ category: string; brand: string }[]> {
    const entries = await sitemap();
    return entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.startsWith("/collections/") && p.includes("/f/"))
      .map((p) => {
        const [base, facet] = p.split("/f/");
        return {
          category: base!.split("/").filter(Boolean).pop()!,
          decoded: decodeFilterSlug(facet!),
        };
      })
      .filter((e) => e.decoded.brands.length === 1)
      .map((e) => ({ category: e.category, brand: e.decoded.brands[0]! }));
  }

  it("advertises only the brands a category actually stocks", async () => {
    collectionsGetCategories.mockResolvedValue([
      { slug: "suspension", children: [] },
      { slug: "locks", children: [] },
    ]);
    brandsList.mockResolvedValue(GLOBAL_BRANDS);
    collectionsGetFilters.mockImplementation((slug: string) =>
      Promise.resolve({
        attributes: [],
        brands:
          slug === "suspension"
            ? [{ slug: "shimano", name: "Shimano", count: 12 }]
            : [
                { slug: "abus", name: "Abus", count: 3 },
                { slug: "basil", name: "Basil", count: 1 },
              ],
      }),
    );

    const facets = await brandFacets();

    expect(facets).toEqual([
      { category: "suspension", brand: "shimano" },
      { category: "locks", brand: "abus" },
      { category: "locks", brand: "basil" },
    ]);
    // The blind cross-product would have been 2 × 4 = 8.
    expect(facets).toHaveLength(3);
    expect(facets.some((f) => f.brand === "4iiii")).toBe(false);
  });

  it("advertises nothing for a category that stocks no brand", async () => {
    collectionsGetCategories.mockResolvedValue([
      { slug: "bikes", children: [] },
      { slug: "gift-cards", children: [] },
    ]);
    brandsList.mockResolvedValue(GLOBAL_BRANDS);
    collectionsGetFilters.mockImplementation((slug: string) =>
      Promise.resolve({
        attributes: [],
        brands: slug === "bikes" ? [{ slug: "shimano", count: 4 }] : [],
      }),
    );

    await expect(brandFacets()).resolves.toEqual([
      { category: "bikes", brand: "shimano" },
    ]);
  });

  it("falls back to the global cross-product when NO category can report brands", async () => {
    collectionsGetCategories.mockResolvedValue([
      { slug: "bikes", children: [] },
    ]);
    brandsList.mockResolvedValue({
      brands: [{ slug: "shimano" }, { slug: "abus" }],
    });
    collectionsGetFilters.mockResolvedValue({ attributes: [] });

    await expect(brandFacets()).resolves.toEqual([
      { category: "bikes", brand: "shimano" },
      { category: "bikes", brand: "abus" },
    ]);
  });
});

describe("thin facet cut", () => {
  // The emitter half of `lib/facet-sitemap-thresholds.ts`. That file's own test
  // proves the RULE and the platform default (both bars 0 — no cut). This one
  // proves `app/sitemap.ts` APPLIES the rule, to BOTH families, from the count
  // the getFilters payload already carries.
  //
  // COVERS: which /collections/<cat>/f/<facet> URLs come out of sitemap(), and
  // which counts the emitter hands each predicate.
  // DOES NOT COVER: the route's runtime behaviour. A dropped URL still routes
  // and still answers 200 — nothing here touches that, and no test in this repo
  // asserts it.

  /** Every collection facet URL's `{category, facet}` pair. */
  async function facets(): Promise<{ category: string; facet: string }[]> {
    const entries = await sitemap();
    return entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.startsWith("/collections/") && p.includes("/f/"))
      .map((p) => {
        const [base, facet] = p.split("/f/");
        return {
          category: base!.split("/").filter(Boolean).pop()!,
          facet: facet!,
        };
      });
  }

  function colourSlugs(rows: { facet: string }[]): string[] {
    return rows
      .map((r) => decodeFilterSlug(r.facet))
      .filter((d) => d.brands.length === 0)
      .flatMap((d) => Object.values(d.attributes).flat());
  }

  beforeEach(() => {
    productsList.mockResolvedValue({ products: [], totalPages: 0 });
    collectionsGetCategories.mockResolvedValue([
      { slug: "bikes", children: [] },
    ]);
  });

  it("advertises every facet under the platform default, cutting nothing", async () => {
    // The default both bars sit at. This is the case that must not change for
    // a store that sets neither env value.
    // The real predicate at the real default bar. `meetsFacetThreshold` is the
    // shared implementation and is NOT one of the two names this file spies on,
    // so it comes through the partial mock unchanged.
    keepsColourFacet.mockImplementation((c) =>
      meetsFacetThreshold(c as number, 0),
    );
    keepsBrandFacet.mockImplementation((c) =>
      meetsFacetThreshold(c as number, 0),
    );
    brandsList.mockResolvedValue({ brands: [{ slug: "factor" }] });
    collectionsGetFilters.mockResolvedValue({
      attributes: [
        {
          slug: "colour",
          options: [
            { slug: "black", name: "Black", count: 53 },
            { slug: "agave-sunset", name: "Agave Sunset", count: 1 },
          ],
        },
      ],
      brands: [{ slug: "factor", name: "Factor", count: 1 }],
    });

    const rows = await facets();
    expect(colourSlugs(rows)).toEqual(["black", "agave-sunset"]);
    expect(rows.flatMap((r) => decodeFilterSlug(r.facet).brands)).toEqual([
      "factor",
    ]);
  });

  it("drops the colours the bar refuses, and hands it the reported count", async () => {
    keepsColourFacet.mockImplementation(
      (count) => typeof count === "number" && count >= 3,
    );
    keepsBrandFacet.mockReturnValue(true);
    brandsList.mockResolvedValue({ brands: [] });
    collectionsGetFilters.mockResolvedValue({
      attributes: [
        {
          slug: "colour",
          options: [
            { slug: "black", name: "Black", count: 53 },
            { slug: "red", name: "Red", count: 3 },
            { slug: "oak-green", name: "Oak Green", count: 2 },
            { slug: "agave-sunset", name: "Agave Sunset", count: 1 },
          ],
        },
      ],
      brands: [],
    });

    expect(colourSlugs(await facets())).toEqual(["black", "red"]);
    // The count reaching the predicate is the one the payload carried — the
    // whole cut is free precisely because it needs no read of its own.
    expect(keepsColourFacet.mock.calls.map(([c]) => c)).toEqual([53, 3, 2, 1]);
  });

  it("drops the brands the bar refuses, looked up by SLUG from the same payload", async () => {
    keepsColourFacet.mockReturnValue(true);
    keepsBrandFacet.mockImplementation(
      (count) => typeof count === "number" && count >= 2,
    );
    brandsList.mockResolvedValue({
      brands: [{ slug: "scott" }, { slug: "abus" }, { slug: "factor" }],
    });
    collectionsGetFilters.mockResolvedValue({
      attributes: [],
      brands: [
        { slug: "scott", name: "Scott", count: 98 },
        { slug: "abus", name: "Abus", count: 2 },
        { slug: "factor", name: "Factor", count: 1 },
      ],
    });

    const brands = (await facets())
      .map((r) => decodeFilterSlug(r.facet).brands)
      .flat();
    expect(brands).toEqual(["scott", "abus"]);
    expect(keepsBrandFacet.mock.calls.map(([c]) => c)).toEqual([98, 2, 1]);
  });

  it("reports an UNKNOWN count for a brand the payload gave no count for", async () => {
    // Only an OBSERVED count may drop a URL; the predicate must be able to tell
    // "one product" from "this backend reports no counts". `undefined` is how
    // it is told, and `keepsBrandFacet` answers keep.
    keepsColourFacet.mockReturnValue(true);
    keepsBrandFacet.mockImplementation((count) => count === undefined);
    brandsList.mockResolvedValue({ brands: [{ slug: "scott" }] });
    collectionsGetFilters.mockResolvedValue({
      attributes: [],
      brands: [{ slug: "scott", name: "Scott" }],
    });

    const rows = await facets();
    expect(rows.flatMap((r) => decodeFilterSlug(r.facet).brands)).toEqual([
      "scott",
    ]);
    expect(keepsBrandFacet).toHaveBeenCalledWith(undefined);
  });

  it("leaves the global-brand fallback emitting the full cross-product", async () => {
    // The threshold is applied to brandSlugsPerCategory's RESULT, not its
    // input, so it cannot empty every category's brand list and flip the
    // fallback on. In fallback mode no slug has a count, so nothing is dropped.
    keepsColourFacet.mockReturnValue(true);
    keepsBrandFacet.mockImplementation((count) => count === undefined);
    brandsList.mockResolvedValue({
      brands: [{ slug: "shimano" }, { slug: "abus" }],
    });
    collectionsGetFilters.mockResolvedValue({ attributes: [] });

    const brands = (await facets())
      .map((r) => decodeFilterSlug(r.facet).brands)
      .flat();
    expect(brands).toEqual(["shimano", "abus"]);
  });

  it("leaves the bare category PLP alone", async () => {
    keepsColourFacet.mockReturnValue(false);
    keepsBrandFacet.mockReturnValue(false);
    brandsList.mockResolvedValue({ brands: [{ slug: "factor" }] });
    collectionsGetFilters.mockResolvedValue({
      attributes: [
        { slug: "colour", options: [{ slug: "agave-sunset", count: 1 }] },
      ],
      brands: [{ slug: "factor", count: 1 }],
    });

    const entries = await sitemap();
    const collections = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.startsWith("/collections/"));
    expect(collections).toEqual(["/collections/bikes"]);
  });
});
