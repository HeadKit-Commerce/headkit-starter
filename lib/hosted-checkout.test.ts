import { describe, expect, it } from "vitest";
import { hostedCheckoutUrl } from "@/lib/hosted-checkout";

describe("hostedCheckoutUrl", () => {
  it("returns the Shopify checkout URL when present", () => {
    expect(
      hostedCheckoutUrl({
        checkoutUrl: "https://velvet.myshopify.com/cart/c/abc",
      }),
    ).toBe("https://velvet.myshopify.com/cart/c/abc");
  });

  it("returns null for WooCommerce carts (unset / empty checkoutUrl)", () => {
    expect(hostedCheckoutUrl({})).toBeNull();
    expect(hostedCheckoutUrl({ checkoutUrl: null })).toBeNull();
    expect(hostedCheckoutUrl({ checkoutUrl: "  " })).toBeNull();
    expect(hostedCheckoutUrl(null)).toBeNull();
  });
});
