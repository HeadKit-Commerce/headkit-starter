import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Generic CMS page cache guard (09.5-05, CACHE-04).
 *
 * Generic WP pages (`app/[...slug]`) were fully UNCACHED, so a WP
 * `headkit:page:{slug}` edit invalidated nothing. `getPageData` is now a
 * params-safe `use cache` helper: the slug is read OUTSIDE the cached scope
 * (in `Page`/`generateMetadata`) and passed in as a PLAIN STRING, so the
 * "cannot read params inside use cache" constraint (threat T-09.5-15) is never
 * tripped. This suite proves:
 *   - the cached fn tags `TAG.page(slug)` at `cacheLife('days')`,
 *   - it takes a plain string arg (no `params`/`searchParams`/`cookies` inside),
 *   - it keeps its `.catch(() => null)` so a missing page still resolves null
 *     (so `Page` can `notFound()` deterministically, uncached-safe).
 *
 * `next/cache` is mocked to capture `cacheTag`/`cacheLife`; the SDK and the UI/
 * SEO components the page imports are stubbed so the module loads in node env.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const contentGet = vi.fn<(slug: string, type: string) => Promise<unknown>>();

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    content: {
      get: (slug: string, type: string): Promise<unknown> =>
        contentGet(slug, type),
    },
  },
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/headkit-ui/editorial-content", () => ({
  EditorialContent: (): null => null,
}));
vi.mock("@/components/headkit-ui/cms-page-body", () => ({
  CmsPageBody: (): null => null,
}));

import { getPageData } from "./page";

const SLUG = "about/team";
const EXPECTED_TAG = "headkit:page:about/team";

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  contentGet.mockReset();
  contentGet.mockResolvedValue({ title: "About", content: "", seo: null });
});

describe("getPageData — params-safe cached CMS helper", () => {
  it("tags TAG.page(slug) at cacheLife('days')", async () => {
    await getPageData(SLUG);
    expect(cacheTag).toHaveBeenCalledWith(EXPECTED_TAG);
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });

  it("takes a plain string arg — no runtime API inside use cache", async () => {
    // The cached fn receives an already-joined string and forwards it verbatim
    // to the SDK. It never reads params/searchParams/cookies itself: the caller
    // resolves the slug outside the cached scope and passes the value in.
    await getPageData(SLUG);
    expect(contentGet).toHaveBeenCalledWith(SLUG, "PAGE");
  });

  it("keeps .catch(() => null) so a missing page resolves null (notFound-safe)", async () => {
    contentGet.mockRejectedValueOnce(new Error("404"));
    await expect(getPageData(SLUG)).resolves.toBeNull();
  });
});
