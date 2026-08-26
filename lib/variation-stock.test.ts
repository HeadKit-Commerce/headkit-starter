import { describe, expect, it } from "vitest";
import { isSizeAttrSlug, isVariationOutOfStock } from "./variation-stock";

describe("isVariationOutOfStock", () => {
  it("treats stockStatus outofstock as OOS", () => {
    expect(isVariationOutOfStock({ stockStatus: "outofstock" })).toBe(true);
    expect(isVariationOutOfStock({ stockStatus: "OUTOFSTOCK" })).toBe(true);
  });

  it("treats quantity 0 as OOS even when status is instock", () => {
    expect(
      isVariationOutOfStock({ stockStatus: "instock", stockQuantity: 0 }),
    ).toBe(true);
  });

  it("treats instock with null qty as in stock", () => {
    expect(
      isVariationOutOfStock({ stockStatus: "instock", stockQuantity: null }),
    ).toBe(false);
  });
});

describe("isSizeAttrSlug", () => {
  it("accepts Woo pa_size and Shopify size", () => {
    expect(isSizeAttrSlug("pa_size")).toBe(true);
    expect(isSizeAttrSlug("size")).toBe(true);
    expect(isSizeAttrSlug("pa_color")).toBe(false);
  });
});
