import { describe, expect, it } from "vitest";
import {
  QUOTE_PAYMENT_METHOD_ID,
  STRIPE_PAYMENT_METHOD,
  hasStripeGateway,
  isOfflineOnlyCart,
  offlineGateways,
} from "./payment-gateways";

describe("offlineGateways", () => {
  it("returns nothing when the cart offers no gateways", () => {
    expect(offlineGateways([])).toEqual([]);
    expect(offlineGateways(null)).toEqual([]);
    expect(offlineGateways(undefined)).toEqual([]);
  });

  it("excludes Stripe — it is driven by a payment session, not a finalize", () => {
    expect(offlineGateways([STRIPE_PAYMENT_METHOD])).toEqual([]);
  });

  it("excludes HeadKit Quote — it owns /quote and its own store setting", () => {
    expect(offlineGateways([QUOTE_PAYMENT_METHOD_ID])).toEqual([]);
  });

  it("labels the core offline gateways", () => {
    expect(offlineGateways(["bacs", "cheque", "cod"])).toEqual([
      { id: "bacs", label: "Direct bank transfer" },
      { id: "cheque", label: "Cheque payment" },
      { id: "cod", label: "Cash on delivery" },
    ]);
  });

  it("falls back to the raw id for a gateway it does not know", () => {
    expect(offlineGateways(["custom_invoice"])).toEqual([
      { id: "custom_invoice", label: "custom_invoice" },
    ]);
  });

  it("preserves WooCommerce's order — merchants control gateway order", () => {
    expect(offlineGateways(["cod", "bacs"]).map((g) => g.id)).toEqual([
      "cod",
      "bacs",
    ]);
  });

  it("separates offline gateways from Stripe on a store that offers both", () => {
    const methods = ["bacs", STRIPE_PAYMENT_METHOD, QUOTE_PAYMENT_METHOD_ID];
    expect(offlineGateways(methods).map((g) => g.id)).toEqual(["bacs"]);
    expect(hasStripeGateway(methods)).toBe(true);
  });

  it("is the Pebblr shape: one offline gateway, no Stripe", () => {
    // Their live store reports exactly this, which is why V2 could not check out.
    const methods = ["bacs"];
    expect(hasStripeGateway(methods)).toBe(false);
    expect(offlineGateways(methods)).toEqual([
      { id: "bacs", label: "Direct bank transfer" },
    ]);
  });

  it("drops empty ids rather than rendering a blank choice", () => {
    expect(offlineGateways(["", "bacs"]).map((g) => g.id)).toEqual(["bacs"]);
  });
});

describe("hasStripeGateway", () => {
  it("is false for an absent or empty list", () => {
    expect(hasStripeGateway(null)).toBe(false);
    expect(hasStripeGateway([])).toBe(false);
  });

  it("is false when only offline gateways are available", () => {
    expect(hasStripeGateway(["bacs", "cod"])).toBe(false);
  });
});

describe("isOfflineOnlyCart", () => {
  it("is true for Pebblr's real gateway list (bacs + quote, no Stripe)", () => {
    expect(isOfflineOnlyCart(["bacs", "headkit-quote"])).toBe(true);
  });

  it("is false when Stripe is also offered, so the Stripe session is still created", () => {
    expect(isOfflineOnlyCart(["bacs", "headkit-payments"])).toBe(false);
  });

  it("is false for a Stripe-only store", () => {
    expect(isOfflineOnlyCart(["headkit-payments"])).toBe(false);
  });

  it("is false when quote is the only gateway — quote has its own route", () => {
    expect(isOfflineOnlyCart(["headkit-quote"])).toBe(false);
  });

  it("is false for an absent or empty list, so an unknown cart keeps the Stripe path", () => {
    expect(isOfflineOnlyCart(undefined)).toBe(false);
    expect(isOfflineOnlyCart(null)).toBe(false);
    expect(isOfflineOnlyCart([])).toBe(false);
  });
});
