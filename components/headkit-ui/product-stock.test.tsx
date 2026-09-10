import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * `ProductStock` reads the SAME cached product entry the PDP renders from,
 * and nothing else.
 *
 * It used to opt into request-time rendering (`connection()` + an uncached
 * `products.get`) so the stock line bypassed the static cache. That made it a
 * streamed island on every view, and with JavaScript off a permanent skeleton.
 * Freshness now comes from the theme's tag purges (a stock or price save fires
 * `headkit:product:<slug>`), which expire this entry and the page together —
 * so the read must be `getCachedProduct`, never the bare SDK, and the
 * component must not opt itself dynamic.
 */

const { getCachedProduct, sdkProductsGet, connection } = vi.hoisted(() => ({
  getCachedProduct: vi.fn<(slug: string) => Promise<unknown>>(),
  sdkProductsGet: vi.fn<(slug: string) => Promise<unknown>>(),
  connection: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (slug: string): Promise<unknown> => getCachedProduct(slug),
}));
vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => sdkProductsGet(slug) },
  },
}));
vi.mock("next/server", () => ({
  connection: (): Promise<void> => connection(),
}));
vi.mock("@/components/headkit-ui/availability-status", () => ({
  AvailabilityStatus: (): null => null,
}));

import { ProductStock } from "./product-stock";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";

const PRODUCT = {
  slug: "acme-hoodie",
  stockStatus: "instock",
  stockQuantity: 7,
  attributes: [{ slug: "pa_color", type: "color", fullOptions: [] }],
  variations: [
    {
      stockStatus: "outofstock",
      stockQuantity: 0,
      attributes: [{ key: "pa_color", value: "red" }],
    },
  ],
};

beforeEach(() => {
  getCachedProduct.mockReset();
  sdkProductsGet.mockReset();
  connection.mockReset();
  sdkProductsGet.mockRejectedValue(
    new Error("the stock line must not read the SDK uncached"),
  );
});

describe("ProductStock", () => {
  it("renders the product's stock from the cached entry, without opting dynamic", async () => {
    getCachedProduct.mockResolvedValue(PRODUCT);

    const element = (await ProductStock({
      productSlug: "acme-hoodie",
    })) as ReactElement<{ stockStatus: string; stockQuantity: number | null }>;

    expect(getCachedProduct).toHaveBeenCalledWith("acme-hoodie");
    expect(sdkProductsGet).not.toHaveBeenCalled();
    expect(
      connection,
      "connection() opts the component into request-time rendering, which is exactly what keeps it out of the static shell",
    ).not.toHaveBeenCalled();
    expect(element.type).toBe(AvailabilityStatus);
    expect(element.props).toEqual({ stockStatus: "instock", stockQuantity: 7 });
  });

  it("picks the colourway's variation stock when a colour is selected", async () => {
    getCachedProduct.mockResolvedValue(PRODUCT);

    const element = (await ProductStock({
      productSlug: "acme-hoodie",
      colorSlug: "red",
    })) as ReactElement<{ stockStatus: string; stockQuantity: number | null }>;

    expect(element.props).toEqual({
      stockStatus: "outofstock",
      stockQuantity: 0,
    });
  });

  it("renders nothing for a cache miss, and never throws on a failed read", async () => {
    getCachedProduct.mockResolvedValueOnce(null);
    await expect(ProductStock({ productSlug: "gone" })).resolves.toBeNull();

    getCachedProduct.mockRejectedValueOnce(new Error("provider down"));
    await expect(
      ProductStock({ productSlug: "acme-hoodie" }),
      "a provider outage during a post-action refresh must not trip the route error boundary",
    ).resolves.toBeNull();
  });
});
