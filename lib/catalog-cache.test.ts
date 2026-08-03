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

import { scopeFromFilter } from "@/lib/catalog-cache";

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

  it("maps onSale / isNew to route scopes", () => {
    expect(scopeFromFilter({ onSale: true })).toEqual({
      kind: "route",
      route: "sale",
    });
    expect(scopeFromFilter({ isNew: true })).toEqual({
      kind: "route",
      route: "new",
    });
  });

  it("defaults to shop", () => {
    expect(scopeFromFilter(undefined)).toEqual({ kind: "shop" });
    expect(scopeFromFilter({})).toEqual({ kind: "shop" });
  });
});
