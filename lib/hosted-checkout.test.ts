import { afterEach, describe, expect, it } from "vitest";
import {
  hostedCheckoutUrl,
  isHostedCheckoutHref,
  withShopifyCheckoutChannel,
} from "@/lib/hosted-checkout";

describe("hostedCheckoutUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL;
  });

  it("returns the Shopify checkout URL with channel query when present", () => {
    expect(
      hostedCheckoutUrl({
        checkoutUrl: "https://velvet.myshopify.com/cart/c/abc",
      }),
    ).toBe(
      "https://velvet.myshopify.com/cart/c/abc?channel=headless-storefronts",
    );
  });

  it("preserves an existing channel query param", () => {
    expect(
      hostedCheckoutUrl({
        checkoutUrl:
          "https://velvet.myshopify.com/cart/c/abc?channel=custom-app",
      }),
    ).toBe("https://velvet.myshopify.com/cart/c/abc?channel=custom-app");
  });

  it("honours NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL", () => {
    process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL = "headkit-velvet";
    expect(
      hostedCheckoutUrl({
        checkoutUrl: "https://velvet.myshopify.com/cart/c/abc",
      }),
    ).toBe("https://velvet.myshopify.com/cart/c/abc?channel=headkit-velvet");
  });

  it("returns null for WooCommerce carts (unset / empty checkoutUrl)", () => {
    expect(hostedCheckoutUrl({})).toBeNull();
    expect(hostedCheckoutUrl({ checkoutUrl: null })).toBeNull();
    expect(hostedCheckoutUrl({ checkoutUrl: "  " })).toBeNull();
    expect(hostedCheckoutUrl(null)).toBeNull();
  });
});

describe("withShopifyCheckoutChannel", () => {
  it("returns invalid URLs unchanged", () => {
    expect(withShopifyCheckoutChannel("not-a-url")).toBe("not-a-url");
  });
});

describe("isHostedCheckoutHref", () => {
  it("detects absolute http(s) checkout targets", () => {
    expect(
      isHostedCheckoutHref(
        "https://velvet.myshopify.com/cart/c/abc?channel=headless-storefronts",
      ),
    ).toBe(true);
    expect(isHostedCheckoutHref("/checkout")).toBe(false);
    expect(isHostedCheckoutHref("/quote")).toBe(false);
  });
});
