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
  /**
   * The subscribing half of `docs/cache-revalidation-contract.md`. After D3
   * (2026-09-10) the theme fires `headkit:products` only when the set of
   * listed products changes; a stock or price save reaches a grid ONLY
   * through its scope tag, so every scope must carry the one the theme
   * fires for it: `catalog:cat:{slug}` (category, incl. ancestors),
   * `brand:{slug}`, `route:{sale|new|featured}`. The all-products grid has no
   * per-product tag by design — `route:shop` fires on listing events only,
   * which is the accepted trade-off.
   */
  it.each([
    ["shop", { kind: "shop" } as const, undefined, TAG.route("shop")],
    [
      "category",
      { kind: "category", slug: "electric-bikes" } as const,
      { category: "electric-bikes" },
      TAG.catalogCat("electric-bikes"),
    ],
    [
      "brand",
      { kind: "brand", slug: "trek" } as const,
      { brand: "trek" },
      TAG.brand("trek"),
    ],
    [
      "route sale",
      { kind: "route", route: "sale" } as const,
      { onSale: true },
      TAG.route("sale"),
    ],
    [
      "route new",
      { kind: "route", route: "new" } as const,
      { isNew: true },
      TAG.route("new"),
    ],
    [
      "route featured",
      { kind: "route", route: "featured" } as const,
      { featured: true },
      TAG.route("featured"),
    ],
  ])(
    "%s scope carries its scope tag, headkit:products and no other blanket tag",
    async (_name, scope, filter, scopeTag) => {
      vi.mocked(headkit.collections.list).mockResolvedValue({
        products: [],
        total: 0,
        totalPages: 0,
        page: 1,
        perPage: 24,
      } as never);
      vi.mocked(cacheTag).mockClear();

      await getCachedCatalogPage(filter, 1, 24, scope);

      const tags = vi.mocked(cacheTag).mock.calls.flat();
      // Exactly the scope tag plus the two blanket tags — no other scope's
      // tag (a category grid must not also listen to `route:shop`), and no
      // new blanket subscription.
      const contractTags = tags.filter((t) => t.startsWith("headkit:"));
      expect(contractTags.sort()).toEqual(
        [scopeTag, TAG.products, TAG.catalog].sort(),
      );
    },
  );

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
