import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Brand / post / project sections — pagination and failure visibility.
 *
 * These three sections each asked the WordPress `headkit/v2` endpoint for
 * `per_page=200`. That endpoint declares `'maximum' => 100` and answers HTTP
 * 400 above it rather than clamping, and each section swallowed the rejection
 * with `catch { return []; }` — so on EVERY store built from this starter the
 * sitemap advertised `/brand`, `/news` and `/projects` and not one of their
 * children, with nothing logged. Measured on Bike Society 2026-09-05: 6,205
 * urls, zero `/brand/<slug>`, `/news/<slug>` or `/projects/<slug>`.
 *
 * The fake list sources below therefore REJECT a `perPage` above the cap, the
 * way the real endpoint does; the first test in each family is red against the
 * pre-fix code for that reason alone. They also hold more rows than one page,
 * so capping the ask at 100 (the cheap fix) does not make them pass either —
 * only walking `totalPages` does.
 *
 * They live beside `sitemap.test.ts` rather than inside it because the post and
 * project sections are fixed empty module-level mocks there.
 */

const { SITE_URL } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url };
});

type ListArgs = { page?: number; perPage?: number } | undefined;

const brandsList = vi.fn<(args: ListArgs) => Promise<unknown>>();
const postsList = vi.fn<(args: ListArgs) => Promise<unknown>>();
const projectsList = vi.fn<(args: ListArgs) => Promise<unknown>>();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
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
    // Products, collections and CMS pages are emptied so only the three
    // families under test reach the assertions.
    products: {
      list: (): Promise<unknown> =>
        Promise.resolve({ products: [], totalPages: 0 }),
    },
    collections: {
      getCategories: (): Promise<unknown[]> => Promise.resolve([]),
      getFilters: (): Promise<unknown> => Promise.resolve({ attributes: [] }),
    },
    brands: { list: (args: ListArgs): Promise<unknown> => brandsList(args) },
    posts: {
      list: (args: ListArgs): Promise<unknown> => postsList(args),
      getLanding: (): Promise<null> => Promise.resolve(null),
    },
    projects: {
      list: (args: ListArgs): Promise<unknown> => projectsList(args),
    },
    menu: { getMenus: (): Promise<unknown[]> => Promise.resolve([]) },
    content: { get: (): Promise<null> => Promise.resolve(null) },
  },
}));

import sitemap from "./sitemap";

/** The WordPress cap these three endpoints all declare. */
const WP_PER_PAGE_MAX = 100;

/** Slugs `item-1` … `item-<count>`. */
function slugs(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `item-${i + 1}`);
}

/**
 * A list source that behaves like the real `headkit/v2` endpoint: it rejects
 * any `per_page` above the cap instead of clamping, and otherwise answers one
 * page at a time with the `total_pages` the endpoint computes.
 */
function pagedSource<K extends string>(
  key: K,
  allSlugs: readonly string[],
): (args: ListArgs) => Promise<Record<string, unknown>> {
  return (args: ListArgs) => {
    const perPage = args?.perPage ?? 12;
    if (perPage > WP_PER_PAGE_MAX) {
      return Promise.reject(
        new Error(
          `rest_invalid_param: per_page must be between 1 and ${WP_PER_PAGE_MAX} (got ${perPage})`,
        ),
      );
    }
    const page = args?.page ?? 1;
    const start = (page - 1) * perPage;
    return Promise.resolve({
      [key]: allSlugs
        .slice(start, start + perPage)
        .map((slug) => ({ slug, date: null })),
      page,
      perPage,
      total: allSlugs.length,
      totalPages: Math.ceil(allSlugs.length / perPage),
    });
  };
}

async function urlsUnder(prefix: string): Promise<string[]> {
  const entries = await sitemap();
  return entries
    .map((e) => e.url)
    .filter((u) => u.startsWith(`${SITE_URL}${prefix}/`));
}

beforeEach(() => {
  brandsList.mockReset();
  postsList.mockReset();
  projectsList.mockReset();
  brandsList.mockImplementation(pagedSource("brands", []));
  postsList.mockImplementation(pagedSource("posts", []));
  projectsList.mockImplementation(pagedSource("projects", []));
});

describe.each([
  {
    family: "brands",
    prefix: "/brand",
    mock: brandsList,
    key: "brands" as const,
  },
  { family: "posts", prefix: "/news", mock: postsList, key: "posts" as const },
  {
    family: "projects",
    prefix: "/projects",
    mock: projectsList,
    key: "projects" as const,
  },
])("$family sitemap section", ({ family, prefix, mock, key }) => {
  it("emits every entry of a source larger than one page", async () => {
    const all = slugs(230);
    mock.mockImplementation(pagedSource(key, all));

    const urls = await urlsUnder(prefix);

    expect(
      urls,
      `every ${family} url must be advertised — a source of ${all.length} spans three pages of ${WP_PER_PAGE_MAX}, and asking for all of them at once is the 400 that emptied this section`,
    ).toEqual(all.map((slug) => `${SITE_URL}${prefix}/${slug}`));
  });

  it("keeps walking when a page comes back short of the page size", async () => {
    // A short page is not proof of the last page — only `totalPages` is. If a
    // row is dropped upstream (an unmappable term, a filtered post), treating
    // the short page as final silently truncates the family.
    const all = slugs(140);
    mock.mockImplementation((args: ListArgs) => {
      const page = args?.page ?? 1;
      const slice = page === 1 ? all.slice(0, 60) : all.slice(60);
      return Promise.resolve({
        [key]: slice.map((slug) => ({ slug, date: null })),
        page,
        perPage: args?.perPage ?? WP_PER_PAGE_MAX,
        total: all.length,
        totalPages: 2,
      });
    });

    expect(
      await urlsUnder(prefix),
      "page 2 must still be read after a short page 1 — totalPages is the terminator",
    ).toEqual(all.map((slug) => `${SITE_URL}${prefix}/${slug}`));
  });

  it("never asks the endpoint for more than the WordPress per_page cap", async () => {
    mock.mockImplementation(pagedSource(key, slugs(150)));

    await sitemap();

    for (const call of mock.mock.calls) {
      expect(
        call[0]?.perPage ?? 0,
        `headkit/v2/${family} answers 400 above per_page=${WP_PER_PAGE_MAX}, so a larger ask silently empties the section`,
      ).toBeLessThanOrEqual(WP_PER_PAGE_MAX);
    }
  });

  it("logs the failure and keeps the pages it already read when a later page rejects", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const all = slugs(150);
    const source = pagedSource(key, all);
    mock.mockImplementation((args: ListArgs) =>
      (args?.page ?? 1) > 1
        ? Promise.reject(new Error("upstream exploded"))
        : source(args),
    );

    const urls = await urlsUnder(prefix);

    expect(
      urls,
      "page 1 was read successfully, so its urls must survive a page 2 failure",
    ).toEqual(
      all
        .slice(0, WP_PER_PAGE_MAX)
        .map((slug) => `${SITE_URL}${prefix}/${slug}`),
    );
    expect(
      consoleError.mock.calls.some((call) => String(call[0]).includes(family)),
      `a swallowed failure must name the ${family} section in the log — silence is what hid the original 400`,
    ).toBe(true);
    consoleError.mockRestore();
  });

  it("still yields a non-empty document for the other families when this one rejects outright", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mock.mockImplementation(() => Promise.reject(new Error("400 from WP")));

    const entries = await sitemap();

    expect(
      entries.length,
      "one broken family must not empty the whole sitemap — the static routes are still emitted",
    ).toBeGreaterThan(0);
    expect(
      await urlsUnder(prefix),
      `${family} has no readable source, so it contributes nothing`,
    ).toEqual([]);
    expect(
      consoleError,
      "the rejection must be reported, not swallowed silently",
    ).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
