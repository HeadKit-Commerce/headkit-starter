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
 *
 * DOMAIN THIS EXERCISES, and the domain it does NOT: the colour pick below is
 * SIZE-BLIND by construction — it takes the first variation in payload order
 * carrying the colour, of whatever size that happens to be. That is why
 * `ProductDetail` consumes this slot for SIMPLE products only (`useServerStock`
 * gains `!isVariable`); on a product with a size axis the slot and the Add to
 * Bag button resolved two different variations and the page rendered both
 * answers (`260925-bs-variable-stock-out-of-stock`). These tests therefore
 * assert only what this component computes in isolation. They say NOTHING about
 * whether that answer is the right one to show a shopper — the composition is
 * pinned by `product-detail.stock-agreement.test.tsx`, and a green run here is
 * not evidence the PDP agrees with itself.
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

  it("picks the first payload-order variation for the colour — size-blind, which is why only simple products consume this", async () => {
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

  it("answers from the FIRST matching variation even when a later one for the same colour differs", async () => {
    // Two sizes, one colour, opposite stock. The pick is positional, so it
    // cannot describe whichever size the shopper selected — this is the
    // property, not a bug in the component, and it is the reason
    // `ProductDetail` no longer shows this slot for a variable product.
    getCachedProduct.mockResolvedValue({
      ...PRODUCT,
      variations: [
        {
          stockStatus: "outofstock",
          stockQuantity: 0,
          attributes: [
            { key: "pa_color", value: "red" },
            { key: "pa_size", value: "l" },
          ],
        },
        {
          stockStatus: "instock",
          stockQuantity: 4,
          attributes: [
            { key: "pa_color", value: "red" },
            { key: "pa_size", value: "m" },
          ],
        },
      ],
    });

    const element = (await ProductStock({
      productSlug: "acme-hoodie",
      colorSlug: "red",
    })) as ReactElement<{ stockStatus: string; stockQuantity: number | null }>;

    expect(
      element.props,
      "the pick is payload-positional and ignores the size axis entirely",
    ).toEqual({ stockStatus: "outofstock", stockQuantity: 0 });
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
