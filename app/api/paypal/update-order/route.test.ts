import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The update route, whose ONE substantive difference from the v1 port is the
 * reason this file exists: **the client does not supply the patch body.**
 *
 * v1 took `{ orderId, payload }` and forwarded `payload` to PayPal verbatim,
 * which is a client-chosen price on a live money object. Here the client names
 * only which order to re-quote and the amount is rebuilt from the server-side
 * cart.
 *
 * The other claim is that a failed patch is NOT a failed checkout: the patch
 * is advisory, and the fresh re-verify at capture is the actual guarantee.
 */

const hoisted = vi.hoisted(() => ({
  getPayPalOrder: vi.fn(),
  patchPayPalOrder: vi.fn(),
  getFullCartAction: vi.fn(),
  getCartToken: vi.fn(),
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "shh",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return hoisted.env;
  },
}));
vi.mock("@/lib/paypal/client", () => ({
  getPayPalOrder: hoisted.getPayPalOrder,
  patchPayPalOrder: hoisted.patchPayPalOrder,
}));
vi.mock("@/lib/cart", () => ({ getCartToken: hoisted.getCartToken }));
vi.mock("@/lib/cart-actions", () => ({
  getFullCartAction: hoisted.getFullCartAction,
}));

const { PATCH } = await import("./route");

const PAYPAL_ORDER_ID = "5O190127TN364715T";
const REFERENCE_ID = "eyJhbGciOiJIUzI1NiJ9.payload.sig";

function cart(totalPrice = "99") {
  return {
    itemsCount: 1,
    paymentMethods: ["headkit-payments"],
    checkoutUrl: null,
    currency: { code: "AUD", minorUnit: 2 },
    totals: {
      totalItems: "80",
      totalItemsTax: "8",
      totalShipping: "10",
      totalShippingTax: "1",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalPrice,
    },
  };
}

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.env = {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "shh",
  };
  hoisted.getCartToken.mockResolvedValue("cart-token");
  hoisted.getFullCartAction.mockResolvedValue(cart());
  hoisted.getPayPalOrder.mockResolvedValue({
    id: PAYPAL_ORDER_ID,
    status: "CREATED",
    purchase_units: [{ reference_id: REFERENCE_ID }],
  });
  hoisted.patchPayPalOrder.mockResolvedValue(undefined);
});

describe("the client names the order, never the amount", () => {
  it("rebuilds the amount from the cart", async () => {
    const response = await PATCH(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    const [, , operations] = hoisted.patchPayPalOrder.mock.calls[0] as [
      unknown,
      string,
      Array<{ op: string; path: string; value: { value: string } }>,
    ];
    expect(operations[0]?.value.value).toBe("99.00");
  });

  it("ignores any amount the caller tries to supply", async () => {
    await PATCH(
      request({
        orderId: PAYPAL_ORDER_ID,
        // v1 would have forwarded this straight to PayPal.
        payload: JSON.stringify([
          {
            op: "replace",
            path: "/purchase_units/@reference_id=='x'/amount",
            value: { currency_code: "AUD", value: "0.01" },
          },
        ]),
        amount: { value: "0.01" },
      }),
    );
    const [, , operations] = hoisted.patchPayPalOrder.mock.calls[0] as [
      unknown,
      string,
      Array<{ value: { value: string } }>,
    ];
    expect(operations[0]?.value.value).toBe("99.00");
    expect(JSON.stringify(operations)).not.toContain("0.01");
  });

  it("addresses the purchase unit by the reference_id THIS order carries", async () => {
    // Reconstructing it from the current cookie would patch nothing after a
    // cart-token rotation, silently.
    await PATCH(request({ orderId: PAYPAL_ORDER_ID }));
    const [, , operations] = hoisted.patchPayPalOrder.mock.calls[0] as [
      unknown,
      string,
      Array<{ path: string }>,
    ];
    expect(operations[0]?.path).toBe(
      `/purchase_units/@reference_id=='${REFERENCE_ID}'/amount`,
    );
  });

  it("rejects a malformed order id before reaching PayPal", async () => {
    for (const orderId of [undefined, "", "lower", "../x"]) {
      expect((await PATCH(request({ orderId }))).status).toBe(400);
    }
    expect(hoisted.getPayPalOrder).not.toHaveBeenCalled();
  });

  it("answers 503 with no credentials", async () => {
    hoisted.env = {};
    expect((await PATCH(request({ orderId: PAYPAL_ORDER_ID }))).status).toBe(
      503,
    );
    expect(hoisted.patchPayPalOrder).not.toHaveBeenCalled();
  });
});

describe("a failed patch is not a failed checkout", () => {
  it("answers 200 with patched:false when PayPal refuses", async () => {
    // PayPal rejects a patch once the buyer has approved — an ordinary race,
    // and the capture guard catches any real drift anyway.
    hoisted.patchPayPalOrder.mockRejectedValue(
      new Error("ORDER_ALREADY_CAPTURED"),
    );
    const response = await PATCH(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ patched: false });
  });

  it("answers 200 with patched:false when the order read fails", async () => {
    hoisted.getPayPalOrder.mockRejectedValue(new Error("timeout"));
    const response = await PATCH(request({ orderId: PAYPAL_ORDER_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ patched: false });
  });
});
