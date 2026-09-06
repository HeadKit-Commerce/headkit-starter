import { describe, expect, it } from "vitest";
import {
  detectShopifyStorefront,
  resolveWholesaleFormId,
} from "./shopify-storefront";

describe("detectShopifyStorefront", () => {
  it("is true when CAA is enabled", () => {
    expect(detectShopifyStorefront({ caaEnabled: "true" })).toBe(true);
  });

  it("is true when a Shopify store domain is set", () => {
    expect(
      detectShopifyStorefront({ publicStoreDomain: "velvet.myshopify.com" }),
    ).toBe(true);
    expect(
      detectShopifyStorefront({ storeDomain: "velvet.myshopify.com" }),
    ).toBe(true);
  });

  it("is false for Woo / unset Shopify signals", () => {
    expect(detectShopifyStorefront({})).toBe(false);
    expect(detectShopifyStorefront({ caaEnabled: "false" })).toBe(false);
  });
});

describe("resolveWholesaleFormId", () => {
  it("keeps an explicit env id on every provider", () => {
    expect(resolveWholesaleFormId("8", false)).toBe("8");
    expect(resolveWholesaleFormId("8", true)).toBe("8");
  });

  it("defaults Shopify to the built-in contact form", () => {
    expect(resolveWholesaleFormId(undefined, true)).toBe("1");
  });

  it("leaves Woo unset so the route renders content only", () => {
    expect(resolveWholesaleFormId(undefined, false)).toBeUndefined();
  });
});
