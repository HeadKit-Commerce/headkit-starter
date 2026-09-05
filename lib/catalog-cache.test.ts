import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sdk", () => ({
  headkit: {
    collections: { list: vi.fn() },
    brands: { list: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

import { cacheTag } from "next/cache";
import { headkit } from "@/lib/sdk";
import { getCachedCatalogPage, scopeFromFilter } from "@/lib/catalog-cache";
import { TAG } from "@/lib/cache-tags";

describe("scopeFromFilter", () => {
  it("prefers singular brand over shop", () => {
    expect(scopeFromFilter({ brand: "nike" })).toEqual({
      kind: "brand",
      slug: "nike",
    });
  });

  it("uses singular category", () => {
    expect(scopeFromFilter({ category: "hoodies" })).toEqual({
      kind: "category",
      slug: "hoodies",
    });
  });

  it("maps onSale / isNew / featured to route scopes", () => {
    expect(scopeFromFilter({ onSale: true })).toEqual({
      kind: "route",
      route: "sale",
    });
    expect(scopeFromFilter({ isNew: true })).toEqual({
      kind: "route",
      route: "new",
    });
    expect(scopeFromFilter({ featured: true })).toEqual({
      kind: "route",
      route: "featured",
    });
  });

  it("defaults to shop", () => {
    expect(scopeFromFilter(undefined)).toEqual({ kind: "shop" });
    expect(scopeFromFilter({})).toEqual({ kind: "shop" });
  });
});

describe("getCachedCatalogPage tags", () => {
  it("subscribes category PLPs to headkit:products so Shopify product webhooks drop the grid", async () => {
    vi.mocked(headkit.collections.list).mockResolvedValue({
      products: [],
      total: 0,
      totalPages: 0,
      page: 1,
      perPage: 24,
    } as never);
    vi.mocked(cacheTag).mockClear();

    await getCachedCatalogPage({ category: "insignia" }, 1, 24, {
      kind: "category",
      slug: "insignia",
    });

    const tags = vi.mocked(cacheTag).mock.calls.flat();
    expect(tags).toContain(TAG.products);
    expect(tags).toContain(TAG.catalog);
    expect(tags).toContain(TAG.catalogCat("insignia"));
  });
});
