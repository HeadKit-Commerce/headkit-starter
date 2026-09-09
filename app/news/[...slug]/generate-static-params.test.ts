import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `generateStaticParams` on the post route prerenders the MOST RECENT posts,
 * capped, with the `__hk_static_placeholder` param kept FIRST for the 404
 * gate (`app/not-found-status.test.ts` owns the gate itself; this file owns
 * the enumeration).
 *
 * The properties, each asserted below:
 *  - the placeholder is always present and always first;
 *  - the cap holds ACROSS pages, and no page past the cap is read;
 *  - the walk ends on the endpoint's `totalPages` or an empty page, never on a
 *    short page;
 *  - a read failure or a store with no posts yields the placeholder ONLY and
 *    never throws — a build must survive a blog that is absent or unreachable;
 *  - slugs are emitted as ONE segment each (the route reads the last segment),
 *    deduplicated, and a slug the route could not resolve is skipped;
 *  - one structured log line names the count ACTUALLY enumerated.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ??= "pk_test";
  process.env.NEXT_PUBLIC_GRAPHQL_URL ??= "http://localhost:4000/graphql";
  process.env.HEADKIT_PRIVATE_KEY ??= "sk_test";
});

const { postsList, loggerInfo, loggerError } = vi.hoisted(() => ({
  postsList:
    vi.fn<(options: { page: number; perPage: number }) => Promise<unknown>>(),
  loggerInfo:
    vi.fn<(event: string, fields?: Record<string, unknown>) => void>(),
  loggerError:
    vi.fn<(event: string, fields?: Record<string, unknown>) => void>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheTag: (): void => {},
  cacheLife: (): void => {},
}));
vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  unstable_rethrow: (): void => {},
}));
vi.mock("@/lib/sdk", () => ({
  headkit: {
    posts: {
      list: (options: { page: number; perPage: number }): Promise<unknown> =>
        postsList(options),
    },
  },
}));
// Only the SINK is replaced; `errorFields` runs for real so the failure line
// carries the bounded discriminator the logger contract allows.
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return {
    ...actual,
    logger: { ...actual.logger, info: loggerInfo, error: loggerError },
  };
});
vi.mock("@/lib/posts-base-path", () => ({
  getPostsBasePath: (): Promise<string> => Promise.resolve("news"),
  getPostsLanding: (): Promise<null> => Promise.resolve(null),
  postsArticlePath: (base: string, slug: string): string => `/${base}/${slug}`,
  postsIndexPath: (base: string): string => `/${base}`,
}));
vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> => Promise.resolve({}),
  getBrandingAssets: (): Promise<unknown> => Promise.resolve({}),
}));
vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  resolveStoreName: (): string => "Test Store",
  storefrontUrl: (path: string): string => path,
}));
vi.mock("@/components/headkit-ui/post/post-body", () => ({
  PostBody: (): null => null,
}));
vi.mock("@/components/headkit-ui/post/featured-image-header", () => ({
  FeaturedImageHeader: (): null => null,
}));
vi.mock("@/components/headkit-ui/post/post-carousel", () => ({
  PostCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/seo/article-json-ld", () => ({
  ArticleJsonLD: (): null => null,
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/seo/carousel-post-json-ld", () => ({
  CarouselPostJsonLD: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

const PLACEHOLDER = { slug: ["__hk_static_placeholder"] };

type RouteModule = typeof import("./page");

/**
 * `lib/env` parses `process.env` once at module load, so a cap override has
 * to be in place BEFORE the route module is (re)loaded.
 */
async function loadRoute(limit?: string): Promise<RouteModule> {
  vi.resetModules();
  // Zod's `.optional()` treats "" as a value (the regex rejects it), so the
  // default case deletes the key rather than stubbing it empty.
  if (limit === undefined) delete process.env.HEADKIT_PRERENDER_POST_LIMIT;
  else vi.stubEnv("HEADKIT_PRERENDER_POST_LIMIT", limit);
  return import("./page");
}

function post(slug: string | null): { id: string; slug: string | null } {
  return { id: slug ?? "null", slug };
}

/** `count` sequential slugs `p<from>` … so a page's contents are inspectable. */
function slugs(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${from + i}`);
}

function pageOf(
  items: readonly (string | null)[],
  totalPages: number,
): { posts: { id: string; slug: string | null }[]; totalPages: number } {
  return { posts: items.map(post), totalPages };
}

beforeEach(() => {
  postsList.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news/[...slug] generateStaticParams — recent posts, capped, placeholder first", () => {
  it("keeps the placeholder FIRST and follows it with the recent post slugs, one segment each", async () => {
    postsList.mockResolvedValueOnce(pageOf(["newest", "older", "oldest"], 1));
    const route = await loadRoute();

    const params = await route.generateStaticParams();

    expect(params[0]).toEqual(PLACEHOLDER);
    expect(params).toEqual([
      PLACEHOLDER,
      { slug: ["newest"] },
      { slug: ["older"] },
      { slug: ["oldest"] },
    ]);
    // Newest-first is the endpoint's default order; the walk starts at page 1
    // with the endpoint's maximum page size so the cap is met in the fewest
    // list reads.
    expect(postsList).toHaveBeenCalledTimes(1);
    expect(postsList).toHaveBeenCalledWith({ page: 1, perPage: 100 });
  });

  it("defaults the cap to PRERENDER_POST_LIMIT_DEFAULT (100) and holds it across pages", async () => {
    const route = await loadRoute();
    expect(route.PRERENDER_POST_LIMIT_DEFAULT).toBe(100);

    // 60 per page, 5 pages advertised: the cap lands mid-page-2, and page 3 is
    // never read.
    postsList.mockImplementation(({ page }) =>
      Promise.resolve(pageOf(slugs((page - 1) * 60 + 1, 60), 5)),
    );

    const params = await route.generateStaticParams();

    expect(params).toHaveLength(101);
    expect(params[0]).toEqual(PLACEHOLDER);
    expect(params[1]).toEqual({ slug: ["p1"] });
    expect(params[100]).toEqual({ slug: ["p100"] });
    expect(postsList).toHaveBeenCalledTimes(2);
    expect(postsList).toHaveBeenNthCalledWith(1, { page: 1, perPage: 100 });
    expect(postsList).toHaveBeenNthCalledWith(2, { page: 2, perPage: 100 });
  });

  it("honours HEADKIT_PRERENDER_POST_LIMIT as the cap and sizes the page to it", async () => {
    postsList.mockImplementation(({ page }) =>
      Promise.resolve(pageOf(slugs((page - 1) * 3 + 1, 3), 10)),
    );
    const route = await loadRoute("7");

    const params = await route.generateStaticParams();

    expect(params).toHaveLength(8);
    expect(params.slice(1).map((p) => p.slug[0])).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
    ]);
    expect(postsList).toHaveBeenCalledTimes(3);
    expect(postsList).toHaveBeenNthCalledWith(1, { page: 1, perPage: 7 });
  });

  it("stops on the endpoint's totalPages rather than reading past the last page", async () => {
    // A SHORT page is deliberately not a terminator: page 1 is short, page 2
    // still exists per totalPages, and both are read.
    postsList
      .mockResolvedValueOnce(pageOf(["a", "b"], 2))
      .mockResolvedValueOnce(pageOf(["c"], 2));
    const route = await loadRoute();

    const params = await route.generateStaticParams();

    expect(params).toEqual([
      PLACEHOLDER,
      { slug: ["a"] },
      { slug: ["b"] },
      { slug: ["c"] },
    ]);
    expect(postsList).toHaveBeenCalledTimes(2);
  });

  it("stops on an EMPTY page so a nonsense totalPages cannot spin", async () => {
    postsList
      .mockResolvedValueOnce(pageOf(["a"], Number.MAX_SAFE_INTEGER))
      .mockResolvedValueOnce(pageOf([], Number.MAX_SAFE_INTEGER));
    const route = await loadRoute();

    const params = await route.generateStaticParams();

    expect(params).toEqual([PLACEHOLDER, { slug: ["a"] }]);
    expect(postsList).toHaveBeenCalledTimes(2);
  });

  it("returns the placeholder ONLY when the list read fails, without throwing", async () => {
    postsList.mockRejectedValueOnce(new Error("catalogue unreachable"));
    const route = await loadRoute();

    await expect(route.generateStaticParams()).resolves.toEqual([PLACEHOLDER]);
    expect(loggerError).toHaveBeenCalledTimes(1);
    const [event, fields] = loggerError.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(event).toBe("posts_prerender");
    expect(fields["count"]).toBe(0);
    expect(fields["pages"]).toBe(0);
    expect(fields["name"]).toBe("Error");
    expect(fields["message"]).toBe(
      "[posts-prerender] list read failed on page 1; placeholder only: catalogue unreachable",
    );
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  it("returns the placeholder ONLY when a later page fails — never a build failure", async () => {
    postsList
      .mockResolvedValueOnce(pageOf(["a"], 3))
      .mockRejectedValueOnce(new Error("page 2 timed out"));
    const route = await loadRoute();

    await expect(route.generateStaticParams()).resolves.toEqual([PLACEHOLDER]);
    expect(loggerError).toHaveBeenCalledTimes(1);
    const [, fields] = loggerError.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fields["pages"]).toBe(1);
  });

  it("returns the placeholder ONLY for a store with no posts", async () => {
    postsList.mockResolvedValueOnce(pageOf([], 0));
    const route = await loadRoute();

    await expect(route.generateStaticParams()).resolves.toEqual([PLACEHOLDER]);
    expect(loggerError).not.toHaveBeenCalled();
    const [, fields] = loggerInfo.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fields["count"]).toBe(0);
  });

  it("returns the placeholder ONLY and reads nothing when the cap is 0", async () => {
    const route = await loadRoute("0");

    await expect(route.generateStaticParams()).resolves.toEqual([PLACEHOLDER]);
    expect(postsList).not.toHaveBeenCalled();
  });

  it("dedupes, skips empty/null/placeholder/separator-bearing slugs, and trims", async () => {
    postsList.mockResolvedValueOnce(
      pageOf(
        [
          "sale",
          "sale",
          " padded ",
          "",
          "   ",
          null,
          "__hk_static_placeholder",
          "nested/looking",
          "last",
        ],
        1,
      ),
    );
    const route = await loadRoute();

    const params = await route.generateStaticParams();

    expect(params).toEqual([
      PLACEHOLDER,
      { slug: ["sale"] },
      { slug: ["padded"] },
      { slug: ["last"] },
    ]);
    // A duplicate does not consume a slot of the cap.
    const [, fields] = loggerInfo.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fields["count"]).toBe(3);
  });

  it("logs ONE structured line with the count actually enumerated", async () => {
    postsList.mockResolvedValueOnce(pageOf(["a", "b"], 1));
    const route = await loadRoute();

    await route.generateStaticParams();

    expect(loggerInfo).toHaveBeenCalledTimes(1);
    const [event, fields] = loggerInfo.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(event).toBe("posts_prerender");
    expect(fields).toMatchObject({ count: 2, limit: 100, pages: 1 });
    expect(fields["message"]).toMatch(/enumerated 2 of up to 100/);
  });
});
