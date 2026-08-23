import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreSitemapRoute } from "@/sitemap.config";

/**
 * The store-owned sitemap extension point (`sitemap.config.ts`).
 *
 * A store with its own hardcoded landing page must be able to get it into the
 * sitemap WITHOUT editing `app/sitemap.ts`, which is shared platform code every
 * store inherits from the starter template.
 *
 * These live in their own file rather than in `sitemap.test.ts` because both
 * levers under test — the store config and `enableSitemap` — are module-level
 * mocks there, fixed for the whole file. Here they are mutable per test.
 */

const { SITE_URL } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url };
});

const state = vi.hoisted(() => ({
  storeRoutes: [] as StoreSitemapRoute[],
  enableSitemap: true,
}));

const menuGetMenus = vi.fn<(locations: string[]) => Promise<unknown>>();
const contentGet = vi.fn<(slug: string, type: string) => Promise<unknown>>();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

// Read through a getter so each test's assignment is visible to the module
// under test without re-importing it.
vi.mock("@/sitemap.config", () => ({
  get storeSitemapRoutes(): readonly StoreSitemapRoute[] {
    return state.storeRoutes;
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { enableSitemap: state.enableSitemap, allowIndexing: true },
      storeSettings: { name: "Acme", domain: null },
    }),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    // Every catalogue section is emptied so only the static + CMS-page
    // sections reach the assertions.
    products: {
      list: (): Promise<unknown> =>
        Promise.resolve({ products: [], totalPages: 0 }),
    },
    collections: {
      getCategories: (): Promise<unknown[]> => Promise.resolve([]),
      getFilters: (): Promise<unknown> => Promise.resolve({ attributes: [] }),
    },
    brands: { list: (): Promise<unknown> => Promise.resolve({ brands: [] }) },
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

import sitemap from "./sitemap";

/** The exact document the platform emits today with no store config. */
const BASELINE_URLS = [
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
].map((p) => `${SITE_URL}${p}`);

function menu(...uris: string[]): unknown {
  return {
    name: "m",
    description: null,
    items: uris.map((uri) => ({ uri })),
  };
}

async function urls(): Promise<string[]> {
  return (await sitemap()).map((e) => e.url);
}

/**
 * A declaration the config's own types would have rejected.
 *
 * `sitemap.config.ts` is source a store edits, so its types are a courtesy, not
 * a guarantee: a cast, a `Number(process.env.X)` that yields `NaN`, or plain JS
 * all reach the platform as a value of the wrong shape.
 */
function unvetted(route: {
  path: string;
  changeFrequency: string;
  priority: unknown;
}): StoreSitemapRoute {
  return route as StoreSitemapRoute;
}

beforeEach(() => {
  state.storeRoutes = [];
  state.enableSitemap = true;
  menuGetMenus.mockReset();
  contentGet.mockReset();
  menuGetMenus.mockResolvedValue([]);
  contentGet.mockResolvedValue(null);
});

describe("store sitemap extension point", () => {
  it("emits both store routes once each, with their declared priority", async () => {
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: 0.9 },
      { path: "/stockists", changeFrequency: "monthly", priority: 0.4 },
    ];

    const entries = await sitemap();
    const store = entries.filter((e) =>
      [`${SITE_URL}/lookbook`, `${SITE_URL}/stockists`].includes(e.url),
    );

    expect(
      store.map((e) => [e.url, e.changeFrequency, e.priority]),
      "a store route must be emitted exactly once, carrying the frequency and priority the store declared",
    ).toEqual([
      [`${SITE_URL}/lookbook`, "weekly", 0.9],
      [`${SITE_URL}/stockists`, "monthly", 0.4],
    ]);
    // Appended after the platform's own routes, which keep their order.
    expect((await urls()).slice(0, BASELINE_URLS.length)).toEqual(
      BASELINE_URLS,
    );
  });

  it("emits a store route that duplicates a platform route exactly once", async () => {
    state.storeRoutes = [
      { path: "/sale", changeFrequency: "monthly", priority: 0.1 },
    ];

    const entries = await sitemap();
    const sale = entries.filter((e) => e.url === `${SITE_URL}/sale`);

    expect(sale, "a restated platform route must not double up").toHaveLength(
      1,
    );
    expect(
      sale[0]?.priority,
      "the platform's own entry wins the collision — a store cannot silently downgrade a platform route",
    ).toBe(0.7);
  });

  it("emits a store route that is ALSO a CMS page exactly once, and does not probe it", async () => {
    // The failure this guards: feed the store routes only to the emitting
    // section and the CMS-page probe still discovers the same path from a menu,
    // spends a full page payload on it, and emits a second entry.
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: 0.9 },
    ];
    menuGetMenus.mockResolvedValue([menu("/lookbook")]);
    contentGet.mockResolvedValue({ slug: "lookbook" });

    const found = (await urls()).filter((u) => u === `${SITE_URL}/lookbook`);

    expect(found, "a store route linked from a menu must appear once").toEqual([
      `${SITE_URL}/lookbook`,
    ]);
    expect(
      contentGet,
      "the probe-skip set must see store routes too — probing a path the static section already emits is pure cost",
    ).not.toHaveBeenCalled();
  });

  it("collapses a path the store declares twice", async () => {
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: 0.9 },
      { path: "/lookbook/", changeFrequency: "daily", priority: 0.2 },
    ];

    expect(
      (await urls()).filter((u) => u === `${SITE_URL}/lookbook`),
      "a trailing slash is a typo, not a second route",
    ).toEqual([`${SITE_URL}/lookbook`]);
  });

  it("produces today's document byte-for-byte when no store routes are declared", async () => {
    expect(
      await urls(),
      "the shipped empty config must change nothing — a store that adds nothing needs no edit at all",
    ).toEqual(BASELINE_URLS);
  });

  it("emits nothing when enableSitemap is off, store routes included", async () => {
    state.enableSitemap = false;
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: 0.9 },
    ];

    expect(
      await urls(),
      "sitemap off means the document is removed completely — a store route must not leak past the gate",
    ).toEqual([]);
  });

  it("drops a declaration that would produce an off-site or malformed <loc>", async () => {
    state.storeRoutes = [
      // Path-like but resolves off-site when joined to a base url.
      { path: "//attacker.example/x", changeFrequency: "weekly", priority: 1 },
      {
        path: "https://attacker.example/x",
        changeFrequency: "weekly",
        priority: 1,
      },
      // Not site-relative — would concatenate into `.../comshop`.
      { path: "lookbook", changeFrequency: "weekly", priority: 1 },
      { path: "/press?utm=x", changeFrequency: "weekly", priority: 1 },
      { path: "/press#top", changeFrequency: "weekly", priority: 1 },
      // On-site, but not a valid URL.
      { path: "/spring sale", changeFrequency: "weekly", priority: 1 },
      { path: "/press\tkit", changeFrequency: "weekly", priority: 1 },
      { path: "/press\nkit", changeFrequency: "weekly", priority: 1 },
      { path: "/press\u007fkit", changeFrequency: "weekly", priority: 1 },
      // Illegal as raw XML text. Next interpolates the url into <loc> with no
      // escaping, so ONE of these breaks parsing of the entire document.
      { path: "/dolce&gabbana", changeFrequency: "weekly", priority: 1 },
      { path: "/a<b", changeFrequency: "weekly", priority: 1 },
      { path: "/a>b", changeFrequency: "weekly", priority: 1 },
      // The platform always emits home itself.
      { path: "/", changeFrequency: "weekly", priority: 1 },
    ];

    expect(
      await urls(),
      "the store owns WHICH routes it declares; the platform owns whether a declaration can corrupt the document",
    ).toEqual(BASELINE_URLS);
  });

  it("never emits a <loc> that would break the XML document", async () => {
    // Next interpolates the url straight into `<loc>${url}</loc>` with no
    // escaping, so a raw `&` or `<` anywhere in the document makes a crawler
    // reject ALL of it — not just the offending entry. Asserted over every
    // section, not only the store's, since the guarantee is document-wide.
    state.storeRoutes = [
      { path: "/dolce&gabbana", changeFrequency: "weekly", priority: 0.6 },
      { path: "/a<b", changeFrequency: "weekly", priority: 0.6 },
      { path: "/lookbook", changeFrequency: "weekly", priority: 0.6 },
    ];
    menuGetMenus.mockResolvedValue([menu("/press")]);
    contentGet.mockResolvedValue({ slug: "press" });

    const emitted = await urls();

    expect(
      emitted.filter((u) => /[&<>]/.test(u)),
      "a raw &, < or > in any <loc> is a parse error for the whole sitemap",
    ).toEqual([]);
    expect(
      emitted,
      "rejecting the XML-breaking paths must not cost the well-formed ones",
    ).toEqual([...BASELINE_URLS, `${SITE_URL}/lookbook`, `${SITE_URL}/press`]);
  });

  it("degrades to no store routes when the config export is not an array", async () => {
    // `staticSitemapRoutes()` is called from buildCachedSitemap OUTSIDE any
    // try/catch, so a TypeError here 500s /sitemap.xml outright — every
    // product, collection, brand, post and page lost, not just this section.
    state.storeRoutes = {} as unknown as StoreSitemapRoute[];
    menuGetMenus.mockResolvedValue([menu("/lookbook")]);
    contentGet.mockResolvedValue({ slug: "lookbook" });

    expect(
      await urls(),
      "a non-iterable config must cost only the store's own routes — the rest of the document still has to build",
    ).toEqual([...BASELINE_URLS, `${SITE_URL}/lookbook`]);
  });

  it("drops an entry whose changeFrequency is not a sitemap value", async () => {
    state.storeRoutes = [
      unvetted({
        path: "/lookbook",
        changeFrequency: "fortnightly",
        priority: 0.9,
      }),
      unvetted({ path: "/stockists", changeFrequency: "", priority: 0.9 }),
    ];

    expect(
      await urls(),
      "a <changefreq> outside the protocol's values is malformed output, so the entry is dropped rather than emitted",
    ).toEqual(BASELINE_URLS);
  });

  it("drops an entry whose priority is not a finite number", async () => {
    // How this reaches production: `priority: Number(process.env.X)` with the
    // var unset is `NaN`, which is typed `number` and survives both halves of a
    // min/max clamp — `<priority>NaN</priority>` for every crawler.
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: Number.NaN },
      {
        path: "/stockists",
        changeFrequency: "weekly",
        priority: Number.POSITIVE_INFINITY,
      },
      unvetted({ path: "/press", changeFrequency: "weekly", priority: "0.9" }),
    ];

    expect(
      await urls(),
      "a non-finite priority has no nearest in-range value to clamp toward, so the entry is dropped rather than repaired",
    ).toEqual(BASELINE_URLS);
  });

  it("still emits an entry whose sibling declaration was dropped", async () => {
    state.storeRoutes = [
      unvetted({
        path: "/lookbook",
        changeFrequency: "fortnightly",
        priority: 0.9,
      }),
      { path: "/stockists", changeFrequency: "monthly", priority: 0.4 },
    ];

    const entries = await sitemap();

    expect(
      entries.map((e) => e.url).filter((u) => u === `${SITE_URL}/lookbook`),
      "one bad declaration must not take the rest of the config with it",
    ).toEqual([]);
    expect(
      entries.find((e) => e.url === `${SITE_URL}/stockists`)?.priority,
    ).toBe(0.4);
  });

  it("clamps a priority declared outside 0.0-1.0", async () => {
    state.storeRoutes = [
      { path: "/lookbook", changeFrequency: "weekly", priority: 7 },
      { path: "/stockists", changeFrequency: "weekly", priority: -3 },
    ];

    const entries = await sitemap();
    expect(
      entries.find((e) => e.url === `${SITE_URL}/lookbook`)?.priority,
    ).toBe(1);
    expect(
      entries.find((e) => e.url === `${SITE_URL}/stockists`)?.priority,
    ).toBe(0);
  });
});
