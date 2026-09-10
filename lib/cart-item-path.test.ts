import { describe, expect, it, vi } from "vitest";

const getCachedProduct = vi.fn<(slug: string) => Promise<unknown>>();

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (slug: string): Promise<unknown> => getCachedProduct(slug),
}));

import { resolveCartItemPath } from "@/lib/cart-item-path";

describe("resolveCartItemPath (G23 cart-drawer canonical link)", () => {
  it("resolves the nested canonical path when the cached product carries a /shop permalink", async () => {
    getCachedProduct.mockResolvedValueOnce({
      slug: "widget",
      uri: "https://store.example/shop/tools/widget/",
    });

    await expect(resolveCartItemPath("widget")).resolves.toBe(
      "/shop/tools/widget",
    );
  });

  it("falls back to the flat product path when the permalink has no /shop ancestry", async () => {
    getCachedProduct.mockResolvedValueOnce({
      slug: "widget",
      uri: "https://store.example/product/widget/",
    });

    await expect(resolveCartItemPath("widget")).resolves.toBe(
      "/products/widget",
    );
  });

  it("returns null when the product cache has nothing for the slug", async () => {
    getCachedProduct.mockResolvedValueOnce(null);

    await expect(resolveCartItemPath("missing")).resolves.toBeNull();
  });

  it("returns null instead of throwing when the product read fails", async () => {
    getCachedProduct.mockRejectedValueOnce(new Error("origin unavailable"));

    await expect(resolveCartItemPath("widget")).resolves.toBeNull();
  });
});
