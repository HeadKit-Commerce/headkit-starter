import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

/**
 * The post route hands `PostBody` the post's hydrated `editorBlocks` and reads
 * the Posts landing through the cached helper — never the bare SDK read.
 *
 * Two per-request origin costs lived here: `sdk.posts.getLanding()` called
 * uncached inside the article component (~0.5 s per view), and `PostBody`
 * receiving `[]` for its blocks so every product carousel re-read its products
 * (24 reads, ~14 s on one sale post). `generateStaticParams` / the 404 gate
 * are covered by `app/not-found-status.test.ts`; this file is only about
 * those two reads.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ??= "pk_test";
  process.env.NEXT_PUBLIC_GRAPHQL_URL ??= "http://localhost:4000/graphql";
  process.env.HEADKIT_PRIVATE_KEY ??= "sk_test";
});

const {
  contentGet,
  sdkGetLanding,
  getPostsLanding,
  postBodyProps,
  breadcrumbProps,
} = vi.hoisted(() => ({
  contentGet: vi.fn<(slug: string, type: string) => Promise<unknown>>(),
  sdkGetLanding: vi.fn<() => Promise<unknown>>(),
  getPostsLanding: vi.fn<() => Promise<unknown>>(),
  postBodyProps: vi.fn<(props: Record<string, unknown>) => void>(),
  breadcrumbProps: vi.fn<(props: Record<string, unknown>) => void>(),
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
    content: {
      get: (slug: string, type: string): Promise<unknown> =>
        contentGet(slug, type),
    },
    posts: { getLanding: (): Promise<unknown> => sdkGetLanding() },
  },
}));
vi.mock("@/lib/posts-base-path", () => ({
  getPostsBasePath: (): Promise<string> => Promise.resolve("journal"),
  getPostsLanding: (): Promise<unknown> => getPostsLanding(),
  postsArticlePath: (base: string, slug: string): string => `/${base}/${slug}`,
  postsIndexPath: (base: string): string => `/${base}`,
}));
vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { allowIndexing: true, ogImageUrl: null },
      storeSettings: { name: "Test Store", domain: "shop.example" },
    }),
  getBrandingAssets: (): Promise<{ iconUrl: null }> =>
    Promise.resolve({ iconUrl: null }),
}));
vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  resolveStoreName: (): string => "Test Store",
  storefrontUrl: (path: string, domain?: string | null): string =>
    `https://${domain ?? "shop.example"}${path}`,
}));

vi.mock("@/components/headkit-ui/post/post-body", () => ({
  PostBody: (props: Record<string, unknown>): null => {
    postBodyProps(props);
    return null;
  },
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (props: Record<string, unknown>): null => {
    breadcrumbProps(props);
    return null;
  },
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
vi.mock("@/components/seo/carousel-post-json-ld", () => ({
  CarouselPostJsonLD: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

import Page from "./page";

/** Resolve every (async) function component so the leaf recorders fire. */
async function drain(node: ReactNode): Promise<void> {
  if (Array.isArray(node)) {
    for (const child of node) await drain(child);
    return;
  }
  if (!node || typeof node !== "object") return;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function") {
    const render = element.type as (
      props: unknown,
    ) => ReactNode | Promise<ReactNode>;
    await drain(await render(element.props));
    return;
  }
  await drain(element.props?.children);
}

const EDITOR_BLOCKS = [
  {
    name: "core/group",
    cssClasses: ["headkit-product-carousel", "headkit-block-section"],
    section: "section-1",
    title: "Sale",
    description: "",
    attrs: { queryType: "handpicked-products" },
    button: null,
    products: [{ id: "1", slug: "chair-one", name: "Chair" }],
  },
];

const POST = {
  id: "10",
  title: "Mid-year sale",
  slug: "mid-year-sale",
  uri: "/journal/mid-year-sale",
  content: "<p>Body</p>",
  seo: null,
  excerpt: null,
  date: null,
  modified: null,
  featuredImage: null,
  categories: [],
  relatedPosts: [],
  editorBlocks: EDITOR_BLOCKS,
};

async function renderPost(): Promise<void> {
  await drain(
    await Page({ params: Promise.resolve({ slug: ["mid-year-sale"] }) }),
  );
}

beforeEach(() => {
  contentGet.mockReset();
  sdkGetLanding.mockReset();
  getPostsLanding.mockReset();
  postBodyProps.mockClear();
  breadcrumbProps.mockClear();
  contentGet.mockResolvedValue(POST);
  getPostsLanding.mockResolvedValue({ title: "Journal", slug: "journal" });
  sdkGetLanding.mockRejectedValue(
    new Error("the route must not read the landing uncached"),
  );
});

describe("news/[...slug] — the two per-request origin reads are gone", () => {
  it("reads the Posts landing through the cached helper, never the bare SDK", async () => {
    await renderPost();
    expect(getPostsLanding).toHaveBeenCalledTimes(1);
    expect(sdkGetLanding).not.toHaveBeenCalled();
    // …and the cached value is what the page renders from.
    const [{ items }] = breadcrumbProps.mock.calls[0] as [
      { items: Array<{ name: string; href: string }> },
    ];
    expect(items[1]).toEqual({ name: "Journal", href: "/journal" });
  });

  it("hands PostBody the post's hydrated editorBlocks (not an empty list)", async () => {
    await renderPost();
    expect(postBodyProps).toHaveBeenCalledTimes(1);
    const [props] = postBodyProps.mock.calls[0] as [Record<string, unknown>];
    expect(props["html"]).toBe("<p>Body</p>");
    expect(props["editorBlocks"]).toBe(EDITOR_BLOCKS);
  });

  it("passes an empty block list when the payload carries none", async () => {
    contentGet.mockResolvedValue({ ...POST, editorBlocks: null });
    await renderPost();
    const [props] = postBodyProps.mock.calls[0] as [Record<string, unknown>];
    expect(props["editorBlocks"]).toEqual([]);
  });
});
