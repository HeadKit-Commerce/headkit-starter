import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PDP cache-tag/life guard (09.5-04 / ENG-853).
 *
 * Canonical PDP is `/products/[...slug]`; `/shop/[...slug]` permanently
 * redirects there. `getCachedProduct` owns the single cache entry tagged
 * `TAG.product(slug)` + `TAG.products` at `cacheLife('days')`.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const productsGet = vi.fn<(slug: string) => Promise<unknown>>();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => productsGet(slug) },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<null> => Promise.resolve(null),
  getBrandingAssets: (): Promise<Record<string, never>> => Promise.resolve({}),
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
  resolveStoreName: (): Promise<string> => Promise.resolve("Test Store"),
}));

vi.mock("@/components/headkit-ui/product-detail", () => ({
  ProductDetail: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-stock", () => ({
  ProductStock: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-carousel", () => ({
  ProductCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/seo/product-json-ld", () => ({
  ProductJsonLD: (): null => null,
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/headkit-ui/collection/utils", () => ({
  isColorAttrSlug: (): boolean => false,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

import { getProduct } from "./page";
import { getCachedProduct } from "@/lib/product-cache";

const SLUG = "acme-hoodie";
const EXPECTED_ENTITY_TAG = "headkit:product:acme-hoodie";
const EXPECTED_INDEX_TAG = "headkit:products";

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  productsGet.mockReset();
  productsGet.mockResolvedValue(null);
});

describe("products/[...slug] getProduct — TAG.product + days", () => {
  it("tags TAG.product(slug) + TAG.products at cacheLife('days')", async () => {
    await getProduct(SLUG);
    expect(cacheTag).toHaveBeenCalledWith(
      EXPECTED_ENTITY_TAG,
      EXPECTED_INDEX_TAG,
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});

describe("shared getCachedProduct is the single PDP cache entry", () => {
  it("page re-export and lib helper produce the IDENTICAL entity tag", async () => {
    await getProduct(SLUG);
    const pageTags = cacheTag.mock.calls[0];

    cacheTag.mockClear();
    await getCachedProduct(SLUG);
    const libTags = cacheTag.mock.calls[0];

    expect(pageTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(libTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(pageTags?.[0]).toBe(libTags?.[0]);
  });
});
