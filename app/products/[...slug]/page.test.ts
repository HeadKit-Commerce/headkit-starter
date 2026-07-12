import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PDP cache-tag/life guard (09.5-04, CACHE-03).
 *
 * The storefront serves the SAME product under two routes — `/products/[...slug]`
 * and `/shop/[...slug]` — each with its OWN `getProduct` `use cache` function.
 * The invariant this suite guards: both defs tag the IDENTICAL contract string
 * `TAG.product(slug)` + `TAG.products` so a single
 * `revalidateTag('headkit:product:{slug}')` invalidates BOTH cached PDP entries,
 * and both use the finite `cacheLife('days')` backstop (was `max`) so a missed
 * product webhook self-heals in ~1 day (threat T-09.5-12).
 *
 * `next/cache` is mocked to capture `cacheTag`/`cacheLife`; the SDK, UI
 * components and lib helpers are stubbed so both page modules import in node env.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const productsGet = vi.fn<(slug: string) => Promise<unknown>>();

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => productsGet(slug) },
  },
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
}));

// Stub every UI/SEO component both PDP modules import so the page files load in
// the node test env (vi.mock factories are hoisted — inline each stub).
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

import { getProduct as getProductProducts } from "./page";
import { getProduct as getProductShop } from "../../shop/[...slug]/page";

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
    await getProductProducts(SLUG);
    expect(cacheTag).toHaveBeenCalledWith(
      EXPECTED_ENTITY_TAG,
      EXPECTED_INDEX_TAG,
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});

describe("shop/[...slug] getProduct — TAG.product + days", () => {
  it("tags TAG.product(slug) + TAG.products at cacheLife('days')", async () => {
    await getProductShop(SLUG);
    expect(cacheTag).toHaveBeenCalledWith(
      EXPECTED_ENTITY_TAG,
      EXPECTED_INDEX_TAG,
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});

describe("one revalidateTag hits both PDP defs", () => {
  it("both defs produce the IDENTICAL entity tag string", async () => {
    await getProductProducts(SLUG);
    const productsTags = cacheTag.mock.calls[0];

    cacheTag.mockClear();
    await getProductShop(SLUG);
    const shopTags = cacheTag.mock.calls[0];

    // The shared entity tag string is what makes revalidateTag hit both entries.
    expect(productsTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(shopTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(productsTags?.[0]).toBe(shopTags?.[0]);
  });
});
