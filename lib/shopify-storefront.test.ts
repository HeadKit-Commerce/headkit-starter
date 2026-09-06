import { describe, expect, it } from "vitest";
import {
  detectShopifyStorefront,
  isShopifyPartnershipsSlug,
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

describe("isShopifyPartnershipsSlug", () => {
  it("matches partnerships (and nested) slugs", () => {
    expect(isShopifyPartnershipsSlug("partnerships")).toBe(true);
    expect(isShopifyPartnershipsSlug("partnership")).toBe(true);
    expect(isShopifyPartnershipsSlug("info/partnerships")).toBe(true);
  });

  it("does not match unrelated CMS pages", () => {
    expect(isShopifyPartnershipsSlug("about")).toBe(false);
    expect(isShopifyPartnershipsSlug("shipping")).toBe(false);
    expect(isShopifyPartnershipsSlug("contact")).toBe(false);
  });
});
