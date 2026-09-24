import { describe, expect, it } from "vitest";
import {
  hasPayPalOption,
  hasStripeGateway,
  isOfflineOnlyCart,
  offlineGateways,
} from "@/lib/payment-gateways";
import { hasHostedCheckout } from "@/lib/hosted-checkout";

/**
 * The gateway classifier.
 *
 * The one claim worth spelling out is the LAST describe block. `hasPayPalOption`
 * decides "is this a hosted-checkout cart?" with its own `checkoutUrl` null-check
 * rather than importing `hasHostedCheckout`, because this module is deliberately
 * dependency-free. Two copies of a definition are exactly how they drift, so the
 * agreement is asserted here over the same inputs instead of assumed.
 */

const wooCart = {
  paymentMethods: ["headkit-payments"],
  checkoutUrl: null,
  totals: { totalPrice: "121" },
};

describe("the existing classifiers still say what they said", () => {
  it("splits offline gateways from the two HeadKit ids", () => {
    expect(
      offlineGateways(["headkit-payments", "bacs", "headkit-quote", "cod"]),
    ).toEqual([
      { id: "bacs", label: "Direct bank transfer" },
      { id: "cod", label: "Cash on delivery" },
    ]);
  });

  it("recognises a Stripe-capable cart", () => {
    expect(hasStripeGateway(["headkit-payments"])).toBe(true);
    expect(hasStripeGateway(["bacs"])).toBe(false);
    expect(hasStripeGateway(null)).toBe(false);
  });

  it("calls a cart offline-only when it has an offline gateway and no Stripe", () => {
    expect(isOfflineOnlyCart(["bacs"])).toBe(true);
    expect(isOfflineOnlyCart(["bacs", "headkit-payments"])).toBe(false);
    expect(isOfflineOnlyCart([])).toBe(false);
  });
});

describe("hasPayPalOption", () => {
  it("needs the store configured", () => {
    expect(hasPayPalOption(wooCart, false)).toBe(false);
    expect(hasPayPalOption(wooCart, true)).toBe(true);
  });

  it("needs the headkit-payments gateway — PayPal settles through it", () => {
    expect(
      hasPayPalOption({ ...wooCart, paymentMethods: ["bacs"] }, true),
    ).toBe(false);
    expect(hasPayPalOption({ ...wooCart, paymentMethods: null }, true)).toBe(
      false,
    );
  });

  it("needs something to pay", () => {
    for (const totalPrice of ["0", "0.00", "", "-5"]) {
      expect(
        hasPayPalOption({ ...wooCart, totals: { totalPrice } }, true),
      ).toBe(false);
    }
    expect(
      hasPayPalOption({ ...wooCart, totals: { totalPrice: "0.01" } }, true),
    ).toBe(true);
  });

  it("is false for a null cart", () => {
    expect(hasPayPalOption(null, true)).toBe(false);
    expect(hasPayPalOption(undefined, true)).toBe(false);
  });
});

describe("its hosted-checkout check agrees with lib/hosted-checkout", () => {
  // Same inputs, both definitions. A divergence here is the drift the duplicate
  // null-check exists to risk, so it is checked rather than trusted.
  const urls: Array<string | null | undefined> = [
    null,
    undefined,
    "",
    "   ",
    "https://shop.myshopify.com/cart/c/abc",
    "https://checkout.brand.com/c/abc",
  ];

  for (const checkoutUrl of urls) {
    it(`agrees for ${JSON.stringify(checkoutUrl)}`, () => {
      const hosted = hasHostedCheckout(
        checkoutUrl === undefined ? {} : { checkoutUrl },
      );
      const paypal = hasPayPalOption({ ...wooCart, checkoutUrl }, true);
      // Hosted ⇒ never PayPal. Not hosted ⇒ PayPal, since every other
      // condition holds for this fixture.
      expect(paypal).toBe(!hosted);
    });
  }
});
