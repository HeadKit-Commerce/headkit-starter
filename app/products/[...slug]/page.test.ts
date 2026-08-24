import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PDP cache-tag/life guard (09.5-04 / ENG-853).
 *
 * Since the 2026-08-22 canonical decision the redirect runs the other way: the
 * NESTED `/shop/[...slug]` is canonical on a store whose WooCommerce permalink
 * base carries the category, and this flat route 308s onto it. Both routes read
 * `getCachedProduct`, which owns the single cache entry tagged
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
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      branding: { hideEmptyCollections: false, defaultCollectionSort: "" },
      seoSettings: { allowIndexing: true, ogImageUrl: null },
      storeSettings: { name: "Test Store", domain: "shop.example" },
    }),
  getBrandingAssets: (): Promise<Record<string, never>> => Promise.resolve({}),
}));

// page.tsx pulls in lib/stripe-config for the BNPL badge, which imports lib/env
// and runs its Zod parse at module scope — that throws under Vitest and would
// fail this file at COLLECT time, silently deleting the guards below rather
// than reddening them.
vi.mock("@/lib/stripe-config", () => ({
  getStripeConfig: (): Promise<{
    publishableKey: string;
    accountId: string;
    bnplMessagingEnabled: boolean;
  }> =>
    Promise.resolve({
      publishableKey: "",
      accountId: "",
      bnplMessagingEnabled: false,
    }),
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
  resolveStoreName: (): Promise<string> => Promise.resolve("Test Store"),
  storefrontUrl: (path: string, domain?: string | null): string =>
    `https://${domain ?? "shop.example"}${path}`,
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
  formatOptionName: (slug: string): string => slug,
}));
vi.mock("@/components/headkit-ui/project/project-carousel", () => ({
  ProjectCarousel: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

import { getProduct, ProductPageContent } from "./page";
import { getCachedProduct } from "@/lib/product-cache";
import { TAG } from "@/lib/cache-tags";

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

/**
 * A product on a store using WooCommerce's DEFAULT `/product/` permalink base:
 * no `/shop` ancestry, so the PDP takes its fallback-crumb branch. On such a
 * store that is EVERY product, which is what makes any cache tag acquired on
 * this branch a whole-catalogue liability rather than an edge case.
 */
const NO_ANCESTRY_PRODUCT = {
  id: "p1",
  name: "Acme Hoodie",
  slug: SLUG,
  uri: "https://commerce.example.com/product/acme-hoodie/",
  shortDescription: "",
  description: "",
  seo: null,
  image: null,
  attributes: [],
  defaultAttributes: [],
  variations: [],
  categories: [{ id: "c1", name: "Hoodies", slug: "hoodies" }],
  related: [],
  upsells: [],
  projects: [],
};

/**
 * DOMAIN OF THIS GUARD, and where it stops.
 *
 * It exercises the FLAT `/products/[...slug]` route only — that is the route
 * `ProductPageContent` is imported from here, and the route that is canonical
 * on a store using WooCommerce's default `/product/` permalink base.
 *
 * IT DOES NOT COVER the nested `/shop/[...slug]` route, which STILL carries
 * `TAG.collections`: `ShopRouteContent` awaits `getShopCategoryTree()` outside
 * any enclosing `"use cache"` scope, so the tag lands on that route's entry and
 * one product save purges every canonical PDP on a nested-permalink store —
 * which is the class both cutover stores (Pebblr, Dishee) are in. That read is
 * load-bearing (the tree is what decides category-vs-product) and pre-dates
 * this branch, so it is not fixed here. Tracked as
 * `260824-nested-pdp-catalogue-purge-tag` (P1).
 *
 * Naming this describe for "the PDP route" would state something false: the
 * guard would read as a store-wide guarantee while covering one of the two
 * routes that serve a PDP.
 */
describe("the FLAT /products route does not subscribe to the whole-catalogue tag", () => {
  it("acquires no TAG.collections while rendering a product with no permalink ancestry", async () => {
    productsGet.mockResolvedValue(NO_ANCESTRY_PRODUCT);

    await ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) });

    const tags = cacheTag.mock.calls.flat();

    // Positive control: the render really happened and this spy really sees the
    // tags it acquires, so the ban below is not vacuous.
    expect(
      tags,
      "the PDP must still own its product entry — a render that acquired no tags at all would satisfy the ban below without proving anything",
    ).toContain(EXPECTED_ENTITY_TAG);

    expect(
      tags,
      "WordPress fires headkit:collections on ANY product or category change, so a PDP that subscribes to it turns one product save into a purge of every PDP on the store (the Bike Society hazard in lib/cache-tags.ts)",
    ).not.toContain(TAG.collections);
  });
});
