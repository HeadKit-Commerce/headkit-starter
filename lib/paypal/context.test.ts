import { describe, expect, it } from "vitest";
import {
  decodePayPalContext,
  encodePayPalContext,
  NO_CART_REFERENCE,
  PAYPAL_CUSTOM_ID_MAX,
  PAYPAL_REFERENCE_ID_MAX,
} from "@/lib/paypal/context";

/**
 * The context the webhook reads back. Its one job is to be UNAMBIGUOUS or
 * absent — a partially-decoded context is how a webhook finalises the wrong
 * order, so every failure mode here degrades to "we do not know" rather than
 * to a plausible wrong answer.
 */

const CART_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidF9hYmMxMjMifQ.Zm9vYmFyc2ln";

describe("round trip", () => {
  it("carries the draft order and the cart token", () => {
    const fields = encodePayPalContext({
      orderId: "4242",
      orderKey: "wc_order_abc123",
      cartToken: CART_TOKEN,
    });
    expect(fields.cartTokenOmitted).toBe(false);
    expect(
      decodePayPalContext({
        customId: fields.customId,
        referenceId: fields.referenceId,
      }),
    ).toEqual({
      orderId: "4242",
      orderKey: "wc_order_abc123",
      cartToken: CART_TOKEN,
    });
  });

  it("fits PayPal's field limits", () => {
    const fields = encodePayPalContext({
      orderId: "999999999",
      orderKey: "wc_order_ZmFrZWtleTEyMzQ1",
      cartToken: CART_TOKEN,
    });
    expect(fields.customId.length).toBeLessThanOrEqual(PAYPAL_CUSTOM_ID_MAX);
    expect(fields.referenceId.length).toBeLessThanOrEqual(
      PAYPAL_REFERENCE_ID_MAX,
    );
  });
});

describe("degradation is one-directional", () => {
  it("reports an over-long cart token instead of truncating it", () => {
    const fields = encodePayPalContext({
      orderId: "4242",
      orderKey: "wc_order_abc123",
      cartToken: "x".repeat(PAYPAL_REFERENCE_ID_MAX + 1),
    });
    expect(fields.cartTokenOmitted).toBe(true);
    expect(fields.referenceId).toBe(NO_CART_REFERENCE);
    // The draft order still travels — only the webhook fallback is lost.
    expect(
      decodePayPalContext({
        customId: fields.customId,
        referenceId: fields.referenceId,
      }),
    ).toEqual({
      orderId: "4242",
      orderKey: "wc_order_abc123",
      cartToken: null,
    });
  });

  it("carries a null draft order as null, not as an empty string", () => {
    const fields = encodePayPalContext({
      orderId: null,
      orderKey: null,
      cartToken: CART_TOKEN,
    });
    const context = decodePayPalContext({
      customId: fields.customId,
      referenceId: fields.referenceId,
    });
    expect(context?.orderId).toBeNull();
    expect(context?.orderKey).toBeNull();
    expect(context?.cartToken).toBe(CART_TOKEN);
  });

  it("refuses to carry a value containing the separator", () => {
    // Ambiguity here would mean decoding a WRONG order id, which is worse than
    // decoding none.
    const fields = encodePayPalContext({
      orderId: "42|99",
      orderKey: "wc_order_abc123",
      cartToken: CART_TOKEN,
    });
    expect(
      decodePayPalContext({
        customId: fields.customId,
        referenceId: fields.referenceId,
      })?.orderId,
    ).toBeNull();
  });
});

describe("orders this storefront did not create", () => {
  const foreign = [
    "",
    "order-4242",
    "hk2|4242|wc_order_abc123",
    "4242|wc_order_abc123",
  ];

  for (const customId of foreign) {
    it(`decodes ${JSON.stringify(customId)} as not ours`, () => {
      expect(
        decodePayPalContext({ customId, referenceId: CART_TOKEN }),
      ).toBeNull();
    });
  }

  it("decodes an absent custom_id as not ours", () => {
    expect(decodePayPalContext({})).toBeNull();
    expect(decodePayPalContext({ customId: null })).toBeNull();
  });
});
