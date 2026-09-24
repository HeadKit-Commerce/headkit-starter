import { beforeEach, describe, expect, it, vi } from "vitest";
// The real class, via the mock below — the 404 branch turns on `instanceof`.
import { PayPalApiError } from "@/lib/paypal/client";

/**
 * The webhook receiver, driven with only PayPal's HTTP client and the checkout
 * actions stubbed.
 *
 * The claims, in the order they matter:
 *
 *  1. **Verification happens BEFORE any lookup.** Not "is verify called" — that
 *     a failed verification leaves every downstream boundary UNTOUCHED, which
 *     is the property an ordering bug actually breaks.
 *  2. **An unset `PAYPAL_WEBHOOK_ID` fails closed** with a status, never
 *     200-with-side-effects. That is the shape of the defect
 *     `app/api/revalidate/route.ts` documents from its own history
 *     (`z.string().optional()` made an unset secret an OPEN endpoint).
 *  3. **Each event type does its own thing**, and `CHECKOUT.ORDER.APPROVED`
 *     does nothing at all — approved is not captured.
 *  4. **A duplicate finalize is success.** The browser normally wins this race;
 *     the webhook losing it is the expected outcome, not an error.
 *  5. **Exactly one order per capture.** The handler now CREATES when
 *     WooCommerce deferred the draft — which on this store is always — so the
 *     duplicate cases are the ones that matter most here: a redelivery, and a
 *     browser that already finalised. Both are driven through the two things
 *     that actually stop a second order (an emptied cart, and the claim row's
 *     rejection), not through a mock that just says "no".
 *
 * The signature itself is never computed here — PayPal computes it, and this
 * suite reaches no network.
 */

const hoisted = vi.hoisted(() => ({
  verifyPayPalWebhookSignature: vi.fn(),
  getPayPalOrder: vi.fn(),
  readCartByToken: vi.fn(),
  processCheckoutOrderAction: vi.fn(),
  processCheckoutAction: vi.fn(),
  webhookId: "WH-TEST-1" as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return {
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test-client-id",
      PAYPAL_CLIENT_SECRET: "test-secret",
      NEXT_PUBLIC_PAYPAL_LIVE_MODE: "false",
      PAYPAL_WEBHOOK_ID: hoisted.webhookId,
    };
  },
}));

vi.mock("@/lib/paypal/client", async () => {
  // PayPalApiError is the REAL class: the 404 branch tests `instanceof`, and a
  // stub of it would make that assertion vacuous.
  const actual = await vi.importActual<typeof import("@/lib/paypal/client")>(
    "@/lib/paypal/client",
  );
  return {
    PayPalApiError: actual.PayPalApiError,
    verifyPayPalWebhookSignature: hoisted.verifyPayPalWebhookSignature,
    getPayPalOrder: hoisted.getPayPalOrder,
  };
});

// Mocked so the suite reaches no gateway — and so the three cart states the
// handler distinguishes (items / empty / unreadable) can each be driven.
vi.mock("@/lib/paypal/cart", () => ({
  readCartByToken: hoisted.readCartByToken,
}));

vi.mock("@/app/checkout/actions", () => ({
  getCheckoutAction: vi.fn(),
  expireCheckoutSessionAction: vi.fn(),
  processCheckoutOrderAction: hoisted.processCheckoutOrderAction,
  processCheckoutAction: hoisted.processCheckoutAction,
}));

const { POST } = await import("./route");

const CAPTURE_ID = "3C679366HH908993F";
const PAYPAL_ORDER_ID = "5O190127TN364715T";
const CART_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidF9hYmMifQ.sig";

const SIGNED_HEADERS: Record<string, string> = {
  "paypal-transmission-id": "t-1",
  "paypal-transmission-time": "2026-09-11T00:00:00Z",
  "paypal-transmission-sig": "sig",
  "paypal-cert-url": "https://api.paypal.com/cert.pem",
  "paypal-auth-algo": "SHA256withRSA",
};

function request(
  event: unknown,
  headers: Record<string, string> = SIGNED_HEADERS,
) {
  return {
    text: async () => JSON.stringify(event),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

function captureCompleted(over: Record<string, unknown> = {}) {
  return {
    id: "WH-EVENT-1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: CAPTURE_ID,
      status: "COMPLETED",
      amount: { currency_code: "AUD", value: "121.00" },
      supplementary_data: { related_ids: { order_id: PAYPAL_ORDER_ID } },
      ...over,
    },
  };
}

function paypalOrder(over: { customId?: string; referenceId?: string } = {}) {
  return {
    id: PAYPAL_ORDER_ID,
    status: "COMPLETED",
    payer: {
      email_address: "buyer@paypal.example",
      name: { given_name: "Grace", surname: "Hopper" },
      address: {
        address_line_1: "1 Navy Yard",
        admin_area_1: "SA",
        admin_area_2: "Adelaide",
        postal_code: "5000",
        country_code: "AU",
      },
    },
    purchase_units: [
      {
        custom_id: over.customId ?? `hk1|4242|wc_order_abc123`,
        reference_id: over.referenceId ?? CART_TOKEN,
      },
    ],
  };
}

/**
 * A cart as the Store API reports it. `itemsCount` is the whole signal: a
 * finalize empties the cart, so 0 means somebody already placed the order.
 */
function cart(itemsCount = 1) {
  return {
    itemsCount,
    billingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "12 Rundle Mall",
      city: "Adelaide",
      state: "SA",
      postcode: "5000",
      country: "AU",
      email: "ada@cart.example",
    },
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "12 Rundle Mall",
      city: "Adelaide",
      state: "SA",
      postcode: "5000",
      country: "AU",
    },
  };
}

/** The shape THIS store actually produces: WC 10.8+ deferred the draft. */
const NO_DRAFT = { customId: "hk1||" };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.webhookId = "WH-TEST-1";
  hoisted.verifyPayPalWebhookSignature.mockResolvedValue(true);
  hoisted.getPayPalOrder.mockResolvedValue(paypalOrder());
  hoisted.readCartByToken.mockResolvedValue(cart());
  hoisted.processCheckoutOrderAction.mockResolvedValue({
    orderId: "4242",
    orderKey: "wc_order_abc123",
  });
  hoisted.processCheckoutAction.mockResolvedValue({
    orderId: "777",
    orderKey: "wc_order_zzz",
  });
});

describe("verification comes first, and failure has no side effects", () => {
  it("rejects an unverified event without reading anything", async () => {
    hoisted.verifyPayPalWebhookSignature.mockResolvedValue(false);
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(401);
    // The whole claim: no order read, no finalize. Not "verify was called".
    expect(hoisted.getPayPalOrder).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
  });

  it("rejects an event with missing transmission headers, before verifying", async () => {
    const response = await POST(request(captureCompleted(), {}));
    expect(response.status).toBe(401);
    expect(hoisted.verifyPayPalWebhookSignature).not.toHaveBeenCalled();
    expect(hoisted.getPayPalOrder).not.toHaveBeenCalled();
  });

  it("fails CLOSED with 503 when PAYPAL_WEBHOOK_ID is unset", async () => {
    hoisted.webhookId = undefined;
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(503);
    // Never a 200 that quietly did nothing, and never a 200 that did something.
    expect(hoisted.verifyPayPalWebhookSignature).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
  });

  it("verifies against the configured webhook id", async () => {
    await POST(request(captureCompleted()));
    expect(hoisted.verifyPayPalWebhookSignature).toHaveBeenCalledWith(
      expect.anything(),
      "WH-TEST-1",
      expect.objectContaining({ transmissionId: "t-1" }),
      expect.objectContaining({ event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    );
  });

  it("refuses a malformed body", async () => {
    const bad = {
      text: async () => "{not json",
      headers: { get: (n: string) => SIGNED_HEADERS[n.toLowerCase()] ?? null },
    } as unknown as Parameters<typeof POST>[0];
    expect((await POST(bad)).status).toBe(400);
  });
});

describe("PAYMENT.CAPTURE.COMPLETED finalises what the browser did not", () => {
  it("adopts the draft order with the capture id as the claim key", async () => {
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);

    const [cartToken, orderId, orderKey, input] = hoisted
      .processCheckoutOrderAction.mock.calls[0] as [
      string,
      string,
      string,
      { paymentData: Array<{ key: string; value: string }> },
    ];
    expect(cartToken).toBe(CART_TOKEN);
    expect(orderId).toBe("4242");
    expect(orderKey).toBe("wc_order_abc123");
    const data = Object.fromEntries(
      input.paymentData.map((e) => [e.key, e.value]),
    );
    // The SAME slot and the SAME value the browser path writes — that identity
    // is what makes the WordPress claim row dedupe the two.
    expect(data["checkout_session_id"]).toBe(CAPTURE_ID);
    expect(data["paypal_capture_id"]).toBe(CAPTURE_ID);
    expect(data["paypal_order_id"]).toBe(PAYPAL_ORDER_ID);
    expect(data["payment_provider"]).toBe("paypal");
  });

  it("CREATES the order from the cart token when WooCommerce deferred the draft", async () => {
    // The defect this closed: `custom_id: "hk1||"` is what every PayPal order
    // on this store carries, and the handler used to stop right here — every
    // event, forever, with the money already taken.
    hoisted.getPayPalOrder.mockResolvedValue(paypalOrder(NO_DRAFT));

    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();

    const [input, cartToken] = hoisted.processCheckoutAction.mock.calls[0] as [
      {
        paymentData: Array<{ key: string; value: string }>;
        shippingAddress: { address1: string };
      },
      string,
    ];
    // The cart token off the PayPal order, because there is no cookie here.
    expect(cartToken).toBe(CART_TOKEN);
    const data = Object.fromEntries(
      input.paymentData.map((e) => [e.key, e.value]),
    );
    // The same bag the browser sends — commerce re-derives the amount from
    // PayPal's capture record using exactly these keys (platform PR #479).
    expect(data["checkout_session_id"]).toBe(CAPTURE_ID);
    expect(data["payment_status"]).toBe("paid");
    expect(data["payment_provider"]).toBe("paypal");
    expect(data["paypal_capture_id"]).toBe(CAPTURE_ID);
    expect(data["paypal_order_id"]).toBe(PAYPAL_ORDER_ID);
    // The CART's address wins over the PayPal payer's — it is the one the
    // shipping rate was quoted against.
    expect(input.shippingAddress.address1).toBe("12 Rundle Mall");
  });

  it("reads the cart BEFORE writing, and writes nothing when it is empty", async () => {
    // The browser won: its finalize emptied this cart. Whatever the claim row
    // would have said, the handler must not even attempt a second order.
    hoisted.getPayPalOrder.mockResolvedValue(paypalOrder(NO_DRAFT));
    hoisted.readCartByToken.mockResolvedValue(cart(0));

    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
  });

  it("a redelivery of the SAME event produces exactly one order", async () => {
    hoisted.getPayPalOrder.mockResolvedValue(paypalOrder(NO_DRAFT));

    // First delivery: cart has items, the order is created.
    expect((await POST(request(captureCompleted()))).status).toBe(200);
    // Which empties the cart — the state the second delivery actually finds.
    hoisted.readCartByToken.mockResolvedValue(cart(0));
    expect((await POST(request(captureCompleted()))).status).toBe(200);

    expect(hoisted.processCheckoutAction).toHaveBeenCalledTimes(1);
  });

  it("treats the claim row's refusal as success on the create path too", async () => {
    // The other half of the race: the cart read still saw items (the browser
    // finalised in between), so the write IS attempted and WordPress refuses
    // it on the capture-id claim row. That refusal is the order existing.
    hoisted.getPayPalOrder.mockResolvedValue(paypalOrder(NO_DRAFT));
    hoisted.processCheckoutAction.mockRejectedValue(
      new Error("Duplicate checkout_session_id"),
    );

    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true });
  });

  it("asks PayPal to retry when the cart could not be READ", async () => {
    // Unreadable is not empty. Acking here would drop a paid event whenever
    // WooCommerce blipped.
    hoisted.getPayPalOrder.mockResolvedValue(paypalOrder(NO_DRAFT));
    hoisted.readCartByToken.mockRejectedValue(new Error("gateway timeout"));

    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(502);
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
  });

  it("still adopts a draft when the cart could not be read", async () => {
    // The adopt branch does not need the cart — the draft order carries the
    // line items — so a cart blip must not cost an order on a store whose
    // WooCommerce still creates drafts.
    hoisted.readCartByToken.mockRejectedValue(new Error("gateway timeout"));

    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    expect(hoisted.processCheckoutOrderAction).toHaveBeenCalledTimes(1);
    const [, , , input] = hoisted.processCheckoutOrderAction.mock.calls[0] as [
      string,
      string,
      string,
      { shippingAddress: { address1: string } },
    ];
    // With no cart, PayPal is the address fallback — as documented in
    // `lib/paypal/addresses.ts`.
    expect(input.shippingAddress.address1).toBe("1 Navy Yard");
  });

  it("fails CLOSED when the cart token could not be carried", async () => {
    hoisted.getPayPalOrder.mockResolvedValue(
      paypalOrder({ referenceId: "hk-no-cart" }),
    );
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    // Nothing identifies the cart, so nothing may be written — and the cart is
    // never even read.
    expect(hoisted.readCartByToken).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
  });

  it("acknowledges a PayPal order this storefront did not create", async () => {
    hoisted.getPayPalOrder.mockResolvedValue(
      paypalOrder({ customId: "someone-elses-marker" }),
    );
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    expect(hoisted.readCartByToken).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
  });

  it("treats a duplicate finalize as SUCCESS — the browser won the race", async () => {
    hoisted.processCheckoutOrderAction.mockRejectedValue(
      new Error("This order has already been paid for."),
    );
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true });
  });

  it("asks PayPal to retry (502) when the finalize failed for a real reason", async () => {
    hoisted.processCheckoutOrderAction.mockRejectedValue(
      new Error("WooCommerce is unreachable"),
    );
    const response = await POST(request(captureCompleted()));
    // The shopper has paid and has no order — losing this event is the worst
    // outcome, so it must be redelivered.
    expect(response.status).toBe(502);
  });

  it("asks PayPal to retry when the order read failed", async () => {
    hoisted.getPayPalOrder.mockRejectedValue(new Error("timeout"));
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(502);
    expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
  });

  it("ACKNOWLEDGES a 404 order read instead of looping forever", async () => {
    // `INVALID_RESOURCE_ID` is permanent. A 502 here is a retry loop with no
    // end — measured live as two deliveries 22 s apart for one event.
    hoisted.getPayPalOrder.mockRejectedValue(
      new PayPalApiError("get_order", 404, "dbg-1", "INVALID_RESOURCE_ID"),
    );
    const response = await POST(request(captureCompleted()));
    expect(response.status).toBe(200);
    expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
  });

  it("still retries a 500 order read — only 404 is permanent", async () => {
    hoisted.getPayPalOrder.mockRejectedValue(
      new PayPalApiError("get_order", 500),
    );
    expect((await POST(request(captureCompleted()))).status).toBe(502);
  });

  it("acknowledges an event with no capture or order id", async () => {
    const response = await POST(
      request({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: CAPTURE_ID },
      }),
    );
    expect(response.status).toBe(200);
    expect(hoisted.getPayPalOrder).not.toHaveBeenCalled();
  });
});

describe("every other event type", () => {
  const cases: Array<[string, number]> = [
    // Approved is NOT captured. Acting on it places an order for money that
    // has not moved.
    ["CHECKOUT.ORDER.APPROVED", 200],
    ["PAYMENT.CAPTURE.PENDING", 200],
    ["PAYMENT.CAPTURE.DENIED", 200],
    ["PAYMENT.CAPTURE.REFUNDED", 200],
    ["BILLING.SUBSCRIPTION.CREATED", 200],
  ];

  for (const [eventType, status] of cases) {
    it(`${eventType} is acknowledged and writes nothing`, async () => {
      const response = await POST(
        request({
          event_type: eventType,
          resource: {
            id: CAPTURE_ID,
            amount: { currency_code: "AUD", value: "121.00" },
            supplementary_data: { related_ids: { order_id: PAYPAL_ORDER_ID } },
          },
        }),
      );
      expect(response.status).toBe(status);
      expect(hoisted.processCheckoutOrderAction).not.toHaveBeenCalled();
      expect(hoisted.processCheckoutAction).not.toHaveBeenCalled();
      // Only the COMPLETED branch is allowed to read the order back.
      expect(hoisted.getPayPalOrder).not.toHaveBeenCalled();
    });
  }
});
