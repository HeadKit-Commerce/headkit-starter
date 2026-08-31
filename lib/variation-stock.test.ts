import { describe, expect, it } from "vitest";
import {
  isBackorderStockStatus,
  isSizeAttrSlug,
  isVariationOutOfStock,
} from "./variation-stock";

describe("isVariationOutOfStock", () => {
  it("treats stockStatus outofstock as OOS", () => {
    expect(isVariationOutOfStock({ stockStatus: "outofstock" })).toBe(true);
    expect(isVariationOutOfStock({ stockStatus: "OUTOFSTOCK" })).toBe(true);
  });

  it("treats onbackorder with quantity 0 as sellable (Shopify CONTINUE)", () => {
    expect(
      isVariationOutOfStock({ stockStatus: "onbackorder", stockQuantity: 0 }),
    ).toBe(false);
  });

  it("does not treat quantity 0 as OOS when status is instock", () => {
    // Status is authoritative once present; zero qty alone is CONTINUE noise.
    expect(
      isVariationOutOfStock({ stockStatus: "instock", stockQuantity: 0 }),
    ).toBe(false);
  });

  it("treats quantity 0 as OOS when status is missing", () => {
    expect(isVariationOutOfStock({ stockQuantity: 0 })).toBe(true);
  });

  it("treats instock with null qty as in stock", () => {
    expect(
      isVariationOutOfStock({ stockStatus: "instock", stockQuantity: null }),
    ).toBe(false);
  });
});

describe("isBackorderStockStatus", () => {
  it("matches onbackorder case-insensitively", () => {
    expect(isBackorderStockStatus("onbackorder")).toBe(true);
    expect(isBackorderStockStatus("ONBACKORDER")).toBe(true);
    expect(isBackorderStockStatus("instock")).toBe(false);
  });
});

describe("isSizeAttrSlug", () => {
  it("accepts Woo pa_size and Shopify size", () => {
    expect(isSizeAttrSlug("pa_size")).toBe(true);
    expect(isSizeAttrSlug("size")).toBe(true);
    expect(isSizeAttrSlug("pa_color")).toBe(false);
  });
});
