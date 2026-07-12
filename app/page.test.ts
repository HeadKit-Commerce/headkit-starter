import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Home cache-tag/life union guard (09.5-03, CACHE-04 / D7).
 *
 * D7: home is ONE monolithic cached entry carrying a UNION of tags — editing any
 * home source fires that source's tag and re-renders the single home entry. Both
 * cached home fns (`getHomepageData` + `HomeContent`) MUST carry the SAME full
 * union so a future edit cannot silently drop a module tag from one of them:
 *   route:home + module:carousel/news/brand/featured + products.
 * Both use the finite `days` backstop (was `max`).
 *
 * `next/cache` is mocked to capture `cacheTag` / `cacheLife`; the SDK, UI
 * components and lib helpers are stubbed so the page module imports in node env.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const homepageGet = vi.fn<() => Promise<unknown>>();
const collectionsList = vi.fn<() => Promise<unknown>>();

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    homepage: { get: (): Promise<unknown> => homepageGet() },
    collections: { list: (): Promise<unknown> => collectionsList() },
  },
}));

vi.mock("@/lib/process-editor-blocks", () => ({
  processEditorBlocks: (): unknown[] => [],
}));
vi.mock("@/lib/make-metadata", () => ({
  makeRootMetadata: (): Record<string, unknown> => ({}),
}));

// NOTE: vi.mock factories are hoisted above module-scope consts, so the stub
// component must be inlined in each factory (cannot reference an outer const).
vi.mock("@/components/headkit-ui/main-carousel", () => ({
  MainCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/block-editor", () => ({
  BlockEditor: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-carousel", () => ({
  ProductCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/category-carousel", () => ({
  CategoryCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/brand-carousel", () => ({
  BrandCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/post-carousel", () => ({
  PostCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-card", () => ({
  ProductCard: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

import { getHomepageData, HomeContent } from "./page";

const HOME_UNION = [
  "headkit:route:home",
  "headkit:module:carousel",
  "headkit:module:news",
  "headkit:module:brand",
  "headkit:module:featured",
  "headkit:products",
];

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  homepageGet.mockReset();
  collectionsList.mockReset();
  homepageGet.mockResolvedValue(null);
  collectionsList.mockResolvedValue({
    products: [],
    total: 0,
    page: 1,
    perPage: 8,
    totalPages: 0,
  });
});

describe("getHomepageData — union-tagged, days backstop", () => {
  it("carries the full home union at cacheLife('days')", async () => {
    await getHomepageData();
    expect(cacheTag).toHaveBeenCalledWith(...HOME_UNION);
    expect(cacheLife).toHaveBeenCalledWith("days");
  });
});

describe("HomeContent — union-tagged, days backstop", () => {
  it("carries the full home union at cacheLife('days')", async () => {
    await HomeContent();
    expect(cacheTag).toHaveBeenCalledWith(...HOME_UNION);
    expect(cacheLife).toHaveBeenCalledWith("days");
  });
});

describe("no legacy home tag / max life survives", () => {
  it("never uses headkit:homepage or cacheLife('max')", async () => {
    await getHomepageData();
    await HomeContent();
    expect(cacheTag.mock.calls.flat()).not.toContain("headkit:homepage");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});
