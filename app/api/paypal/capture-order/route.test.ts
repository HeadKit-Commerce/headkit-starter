import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The capture route, driven end to end with only its OUTWARD boundaries
 * stubbed — PayPal's HTTP client, the cart read, and the two checkout server
 * actions. The amount guard, the ordering, the `payment_data` keys and the
 * address resolution are the real modules.
 *
 * Four claims, each of which shipped broken in v1 or would have:
 *
 *  1. A drifted capture is REFUNDED and refused, not banked.
 *  2. A matching capture places the order with the EXACT `payment_data` keys
 *     the WordPress theme's `_paypal_*` mapping is being written against —
 *     `checkout_session_id` carrying the CAPTURE ID, because that is what
 *     reuses the theme's atomic claim row.
 *  3. `expireCheckoutSessionAction` runs with `SUPERSEDED`, and ONLY after the
 *     order call resolved. `CART_CHANGED` from here would make commerce's
 *     expired-session handler mark a PAID order failed.
 *  4. Pickup and ship-to-home resolve different shipping addresses.
 *
 * What is NOT claimed: nothing here reaches PayPal, WooCommerce or Stripe, and
 * no credential is read. The e2e coverage of a real capture is the sandbox
 * verification that follows this PR.
 */

const hoisted = vi.hoisted(() => ({
  capturePayPalOrder: vi.fn(),
  refundPayPalCapture: vi.fn(),
  getFullCartAction: vi.fn(),
  getCheckoutAction: vi.fn(),
  expireCheckoutSessionAction: vi.fn(),
  processCheckoutOrderAction: vi.fn(),
  processCheckoutAction: vi.fn(),
  getCartToken: vi.fn(),
  /** Call order across the two actions that must not be reordered. */
  calls: [] as string[],
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-secret",
    NEXT_PUBLIC_PAYPAL_LIVE_MODE: "false",
  },
}));

vi.mock("@/lib/paypal/client", () => ({
  capturePayPalOrder: hoisted.capturePayPalOrder,
  refundPayPalCapture: hoisted.refundPayPalCapture,
}));

vi.mock("@/lib/cart", () => ({ getCartToken: hoisted.getCartToken }));
vi.mock("@/lib/cart-actions", () => ({
  getFullCartAction: hoisted.getFullCartAction,
}));
vi.mock("@/app/checkout/actions", () => ({
  getCheckoutAction: hoisted.getCheckoutAction,
  expireCheckoutSessionAction: hoisted.expireCheckoutSessionAction,
  processCheckoutOrderAction: hoisted.processCheckoutOrderAction,
  processCheckoutAction: hoisted.processCheckoutAction,
}));

const { POST } = await import("./route");

const CAPTURE_ID = "3C679366HH908993F";
const PAYPAL_ORDER_ID = "5O190127TN364715T";
const STRIPE_SESSION_ID = "cs_test_a1b2c3d4e5f6g7h8i9j0";

function cart(
  over: {
    totalPrice?: string;
    shipping?: Record<string, string> | null;
    billing?: Record<string, string> | null;
  } = {},
) {
  return {
    itemsCount: 2,
    currency: { code: "AUD", minorUnit: 2 },
    totals: {
      totalItems: "100",
      totalItemsTax: "10",
      totalShipping: "10",
      totalShippingTax: "1",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalPrice: over.totalPrice ?? "121",
    },
    billingAddress:
      over.billing === undefined
        ? {
            firstName: "Ada",
            lastName: "Lovelace",
            address1: "1 Rundle Mall",
            city: "Adelaide",
            state: "SA",
            postcode: "5000",
            country: "AU",
            email: "ada@example.com",
            phone: "+61400000000",
          }
        : over.billing,
    shippingAddress:
      over.shipping === undefined
        ? {
            firstName: "Ada",
            lastName: "Lovelace",
            address1: "9 King William St",
            city: "Adelaide",
            state: "SA",
            postcode: "5000",
            country: "AU",
          }
        : over.shipping,
  };
}

function captureResponse(value: string, currency = "AUD") {
  return {
    id: PAYPAL_ORDER_ID,
    status: "COMPLETED",
    payer: {
      email_address: "buyer@paypal.example",
      name: { given_name: "Grace", surname: "Hopper" },
    },
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: CAPTURE_ID,
              status: "COMPLETED",
              amount: { currency_code: currency, value },
            },
          ],
        },
      },
    ],
  };
}

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.calls.length = 0;
  hoisted.getCartToken.mockResolvedValue("cart-token-jwt");
  hoisted.getFullCartAction.mockResolvedValue(cart());
  hoisted.getCheckoutAction.mockResolvedValue({
    orderId: "4242",
    orderKey: "wc_order_abc123",
  });
  hoisted.processCheckoutOrderAction.mockImplementation(async () => {
    hoisted.calls.push("processCheckoutOrder");
    return { orderId: "4242", orderKey: "wc_order_abc123" };
  });
  hoisted.expireCheckoutSessionAction.mockImplementation(async () => {
    hoisted.calls.push("expireCheckoutSession");
  });
  hoisted.refundPayPalCapture.mockResolvedValue({
    id: "r1",
    status: "COMPLETED",
  });
});

describe("the amount guard", () => {
  it("refunds and refuses a capture that drifted from the cart total", async () => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("1.00"));

    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    const body = (await response.json()) as {
      code?: string;
      refunded?: boolean;
    };

    expect(response.status).toBe(400);
    expect(body.code).toBe("AMOUNT_MISMATCH");
    expect(body.refunded).toBe(true);
    expect(hoisted.refundPayPalCapture).toHaveBeenCalledWith(
      expect.anything(),
      CAPTURE_ID,
      expect.any(String),
    );
    // Nothing was written. A drifted payment must not become an order.
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
    expect(hoisted.expireCheckoutSessionAction).not.toHaveBeenCalled();
  });

  it("still refuses when the auto-refund itself fails", async () => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("1.00"));
    hoisted.refundPayPalCapture.mockRejectedValue(new Error("paypal down"));

    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    const body = (await response.json()) as {
      code?: string;
      refunded?: boolean;
    };

    // A failed reversal makes it a MANUAL reversal — it does not make the
    // payment acceptable.
    expect(response.status).toBe(400);
    expect(body.code).toBe("AMOUNT_MISMATCH");
    expect(body.refunded).toBe(false);
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
  });

  it("refuses a capture in the wrong currency even at the right number", async () => {
    hoisted.capturePayPalOrder.mockResolvedValue(
      captureResponse("121.00", "USD"),
    );
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(400);
    expect(hoisted.refundPayPalCapture).toHaveBeenCalled();
  });

  it("accepts one minor unit of rounding", async () => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("121.01"));
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    expect(hoisted.refundPayPalCapture).not.toHaveBeenCalled();
  });
});

describe("a verified capture places the order", () => {
  beforeEach(() => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("121.00"));
  });

  it("carries the exact payment_data key set the theme is written against", async () => {
    const response = await POST(
      request({ orderId: PAYPAL_ORDER_ID, stripeSessionId: STRIPE_SESSION_ID }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      orderId: "4242",
      orderKey: "wc_order_abc123",
    });

    const [, orderId, orderKey, input] = hoisted.processCheckoutOrderAction.mock
      .calls[0] as [
      string,
      string,
      string,
      {
        paymentMethod: string;
        paymentData: Array<{ key: string; value: string }>;
      },
    ];
    expect(orderId).toBe("4242");
    expect(orderKey).toBe("wc_order_abc123");
    expect(input.paymentMethod).toBe("headkit-payments");

    const data = Object.fromEntries(
      input.paymentData.map((entry) => [entry.key, entry.value]),
    );
    // The claim key. Not the PayPal ORDER id — the CAPTURE id, so the theme's
    // atomic `INSERT IGNORE` claim row dedupes browser against webhook.
    expect(data["checkout_session_id"]).toBe(CAPTURE_ID);
    expect(data["payment_status"]).toBe("paid");
    expect(data["payment_provider"]).toBe("paypal");
    expect(data["paypal_order_id"]).toBe(PAYPAL_ORDER_ID);
    expect(data["paypal_capture_id"]).toBe(CAPTURE_ID);
    // Sandbox credentials in this suite → "test", never "sandbox": the theme's
    // `_headkit_payment_mode` vocabulary is live/test.
    expect(data["payment_mode"]).toBe("test");
  });

  it("passes the CART's addresses, not PayPal's payer profile", async () => {
    await POST(request({ orderId: PAYPAL_ORDER_ID }));
    const [, , , input] = hoisted.processCheckoutOrderAction.mock.calls[0] as [
      string,
      string,
      string,
      {
        billingAddress: {
          firstName?: string;
          address1?: string;
          email?: string;
        };
        shippingAddress: { address1?: string };
      },
    ];
    // PayPal's payer is Grace Hopper; the cart says Ada Lovelace. The cart is
    // the address the rate was quoted against and the shopper actually saw.
    expect(input.billingAddress.firstName).toBe("Ada");
    expect(input.billingAddress.address1).toBe("1 Rundle Mall");
    expect(input.billingAddress.email).toBe("ada@example.com");
    expect(input.shippingAddress.address1).toBe("9 King William St");
  });

  it("falls back to the billing address for a pickup cart with no shipping address", async () => {
    hoisted.getFullCartAction.mockResolvedValue(cart({ shipping: null }));
    await POST(request({ orderId: PAYPAL_ORDER_ID }));
    const [, , , input] = hoisted.processCheckoutOrderAction.mock.calls[0] as [
      string,
      string,
      string,
      { shippingAddress: { address1?: string } },
    ];
    // WooCommerce requires a shipping address even when nothing is shipped.
    expect(input.shippingAddress.address1).toBe("1 Rundle Mall");
  });

  it("creates the order when WooCommerce deferred the draft (WC 10.8+)", async () => {
    hoisted.getCheckoutAction.mockResolvedValue({ orderId: "0", orderKey: "" });
    hoisted.processCheckoutAction.mockResolvedValue({
      orderId: "777",
      orderKey: "wc_order_zzz",
    });

    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
    const [input] = hoisted.processCheckoutAction.mock.calls[0] as [
      { paymentData: Array<{ key: string; value: string }> },
    ];
    // Same claim key on the deferred path — the dedup is not lost with the draft.
    expect(
      input.paymentData.find((e) => e.key === "checkout_session_id")?.value,
    ).toBe(CAPTURE_ID);
  });

  it("treats an already-finalized order as success, not a failure", async () => {
    hoisted.processCheckoutOrderAction.mockRejectedValue(
      new Error("This order has already been paid for."),
    );
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ orderId: "4242" });
  });

  it("does NOT refund when the finalize fails — the shopper has paid", async () => {
    hoisted.processCheckoutOrderAction.mockRejectedValue(
      new Error("WooCommerce is unreachable"),
    );
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "FINALIZE_FAILED",
    });
    expect(hoisted.refundPayPalCapture).not.toHaveBeenCalled();
  });
});

describe("the Stripe session is retired last, and only as SUPERSEDED", () => {
  beforeEach(() => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("121.00"));
  });

  it("expires with SUPERSEDED after the order call resolved", async () => {
    await POST(
      request({ orderId: PAYPAL_ORDER_ID, stripeSessionId: STRIPE_SESSION_ID }),
    );
    expect(hoisted.expireCheckoutSessionAction).toHaveBeenCalledWith(
      STRIPE_SESSION_ID,
      "SUPERSEDED",
    );
    // CART_CHANGED makes commerce's expired-session handler inspect the draft
    // order and mark an orphan `failed` — after PayPal already took the money.
    expect(hoisted.expireCheckoutSessionAction).not.toHaveBeenCalledWith(
      expect.anything(),
      "CART_CHANGED",
    );
    expect(hoisted.calls).toEqual([
      "processCheckoutOrder",
      "expireCheckoutSession",
    ]);
  });

  it("does not expire when the order call failed", async () => {
    hoisted.processCheckoutOrderAction.mockRejectedValue(new Error("boom"));
    await POST(
      request({ orderId: PAYPAL_ORDER_ID, stripeSessionId: STRIPE_SESSION_ID }),
    );
    expect(hoisted.expireCheckoutSessionAction).not.toHaveBeenCalled();
  });

  it("places the order fine when the client sent no Stripe session", async () => {
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    expect(hoisted.expireCheckoutSessionAction).not.toHaveBeenCalled();
  });
});

describe("input validation — the order id is the ONLY thing the client says", () => {
  it("rejects a missing or malformed PayPal order id before capturing", async () => {
    for (const orderId of [undefined, "", "../../etc/passwd", "lower-case"]) {
      const response = await POST(request({ orderId }));
      expect(response.status).toBe(400);
    }
    expect(hoisted.capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("ignores a Stripe session id that is not one", async () => {
    hoisted.capturePayPalOrder.mockResolvedValue(captureResponse("121.00"));
    await POST(
      request({
        orderId: PAYPAL_ORDER_ID,
        stripeSessionId: "pi_not_a_session",
      }),
    );
    expect(hoisted.expireCheckoutSessionAction).not.toHaveBeenCalled();
  });

  it("refuses an empty cart before capturing", async () => {
    hoisted.getFullCartAction.mockResolvedValue({ ...cart(), itemsCount: 0 });
    const response = await POST(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(400);
    expect(hoisted.capturePayPalOrder).not.toHaveBeenCalled();
  });
});
