import { describe, expect, it } from "vitest";
import { needsCheckoutOrderProcessing } from "./checkout-success-utils";

describe("needsCheckoutOrderProcessing", () => {
  it("returns true when order is pending and session has cart token and order ids", () => {
    expect(
      needsCheckoutOrderProcessing(
        "pending",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(true);
    expect(
      needsCheckoutOrderProcessing(
        "pending_payment",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(true);
  });

  it("returns false when order is already processing", () => {
    expect(
      needsCheckoutOrderProcessing(
        "processing",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(false);
  });

  it("returns false when order is completed", () => {
    expect(
      needsCheckoutOrderProcessing(
        "completed",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(false);
  });

  it("returns false when order is on-hold (COD/BACS)", () => {
    expect(
      needsCheckoutOrderProcessing(
        "on-hold",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(false);
  });

  it("returns false when session has no cart token", () => {
    expect(
      needsCheckoutOrderProcessing(
        "pending",
        null,
        "order-456",
        "wc_order_789",
      ),
    ).toBe(false);
    expect(
      needsCheckoutOrderProcessing(
        "pending",
        undefined,
        "order-456",
        "wc_order_789",
      ),
    ).toBe(false);
  });

  it("returns false when session has no order id", () => {
    expect(
      needsCheckoutOrderProcessing(
        "pending",
        "cart-token-123",
        null,
        "wc_order_789",
      ),
    ).toBe(false);
  });

  it("returns false when session has no order key", () => {
    expect(
      needsCheckoutOrderProcessing(
        "pending",
        "cart-token-123",
        "order-456",
        undefined,
      ),
    ).toBe(false);
  });

  it("returns true when order is checkout-draft (WooCommerce Store API draft)", () => {
    expect(
      needsCheckoutOrderProcessing(
        "checkout-draft",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(true);
  });

  it("is case-insensitive for order status", () => {
    expect(
      needsCheckoutOrderProcessing(
        "PENDING",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(true);
    expect(
      needsCheckoutOrderProcessing(
        "PENDING_PAYMENT",
        "cart-token-123",
        "order-456",
        "wc_order_789",
      ),
    ).toBe(true);
  });
});
