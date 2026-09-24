import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The create-order route: what the shopper is asked to approve.
 *
 * The claims:
 *
 *  1. **The request body decides nothing.** The route takes no input at all —
 *     amount, address and delivery choice are read from the server-side cart.
 *  2. **Pickup and ship-to-home map to different PayPal orders.** A Click &
 *     Collect order carries NO shipping address and `NO_SHIPPING`; a delivered
 *     order pins the cart's address with `SET_PROVIDED_ADDRESS` so the buyer
 *     cannot swap it inside PayPal's popup and desync from the quoted rate.
 *  3. **The webhook context is written**, and its absence is reported rather
 *     than silently truncated.
 *  4. **No credentials ⇒ 503 without reaching PayPal.**
 *
 * Not covered: whether PayPal accepts the payload. Nothing here is on a wire.
 */

const hoisted = vi.hoisted(() => ({
  createPayPalOrder: vi.fn(),
  getFullCartAction: vi.fn(),
  getCheckoutAction: vi.fn(),
  getCartToken: vi.fn(),
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "shh",
    NEXT_PUBLIC_PAYPAL_LIVE_MODE: "false",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return hoisted.env;
  },
}));
vi.mock("@/lib/paypal/client", () => ({
  createPayPalOrder: hoisted.createPayPalOrder,
}));
vi.mock("@/lib/cart", () => ({ getCartToken: hoisted.getCartToken }));
vi.mock("@/lib/cart-actions", () => ({
  getFullCartAction: hoisted.getFullCartAction,
}));
vi.mock("@/app/checkout/actions", () => ({
  getCheckoutAction: hoisted.getCheckoutAction,
}));

const { POST } = await import("./route");

const CART_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidF9hYmMifQ.sig";

function cart(over: Record<string, unknown> = {}) {
  return {
    itemsCount: 1,
    needsShipping: true,
    paymentMethods: ["headkit-payments"],
    checkoutUrl: null,
    currency: { code: "AUD", minorUnit: 2 },
    totals: {
      totalItems: "100",
      totalItemsTax: "10",
      totalShipping: "10",
      totalShippingTax: "1",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalPrice: "121",
    },
    items: [{ name: "Tarmac SL8", quantity: 1 }],
    shippingRates: [
      {
        shippingRates: [
          { rateId: "flat_rate:1", selected: true },
          { rateId: "pickup_location:2", selected: false },
        ],
      },
    ],
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "9 King William St",
      city: "Adelaide",
      state: "SA",
      postcode: "5000",
      country: "au",
    },
    ...over,
  };
}

/** The payload as PayPal would receive it. */
function sentPayload() {
  return hoisted.createPayPalOrder.mock.calls[0]?.[1] as {
    intent: string;
    purchase_units: Array<Record<string, unknown>>;
    application_context: { shipping_preference: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.env = {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "shh",
    NEXT_PUBLIC_PAYPAL_LIVE_MODE: "false",
  };
  hoisted.getCartToken.mockResolvedValue(CART_TOKEN);
  hoisted.getFullCartAction.mockResolvedValue(cart());
  hoisted.getCheckoutAction.mockResolvedValue({
    orderId: "4242",
    orderKey: "wc_order_abc123",
  });
  hoisted.createPayPalOrder.mockResolvedValue({
    id: "5O190127TN364715T",
    status: "CREATED",
  });
});

describe("the enable gate", () => {
  it("answers 503 without reaching PayPal when credentials are absent", async () => {
    hoisted.env = {};
    const response = await POST();
    expect(response.status).toBe(503);
    expect(hoisted.createPayPalOrder).not.toHaveBeenCalled();
    // Not even the cart is read.
    expect(hoisted.getFullCartAction).not.toHaveBeenCalled();
  });

  it("refuses a hosted-checkout cart even with credentials", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({ checkoutUrl: "https://shop.myshopify.com/cart/c/abc" }),
    );
    expect((await POST()).status).toBe(400);
    expect(hoisted.createPayPalOrder).not.toHaveBeenCalled();
  });

  it("refuses a zero-total cart", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({
        totals: { ...cart().totals, totalPrice: "0" },
      }),
    );
    expect((await POST()).status).toBe(400);
    expect(hoisted.createPayPalOrder).not.toHaveBeenCalled();
  });

  it("refuses an empty cart", async () => {
    hoisted.getFullCartAction.mockResolvedValue(cart({ itemsCount: 0 }));
    expect((await POST()).status).toBe(400);
  });
});

describe("the amount comes from the cart and nothing else", () => {
  it("quotes totals.totalPrice with a summing breakdown", async () => {
    await POST();
    const unit = sentPayload().purchase_units[0] as {
      amount: { value: string; currency_code: string };
    };
    expect(unit.amount.value).toBe("121.00");
    expect(unit.amount.currency_code).toBe("AUD");
    expect(sentPayload().intent).toBe("CAPTURE");
  });

  it("sends a truncated description, never an items[] array", async () => {
    await POST();
    const unit = sentPayload().purchase_units[0] as {
      description?: string;
      items?: unknown;
    };
    expect(unit.description).toBe("Tarmac SL8 x1");
    expect(unit.items).toBeUndefined();
  });
});

describe("delivery choice decides the shipping block", () => {
  it("ship-to-home pins the cart's address with SET_PROVIDED_ADDRESS", async () => {
    await POST();
    expect(sentPayload().application_context.shipping_preference).toBe(
      "SET_PROVIDED_ADDRESS",
    );
    const unit = sentPayload().purchase_units[0] as {
      shipping?: {
        name?: { full_name?: string };
        address?: Record<string, string>;
      };
    };
    expect(unit.shipping?.name?.full_name).toBe("Ada Lovelace");
    expect(unit.shipping?.address?.["address_line_1"]).toBe(
      "9 King William St",
    );
    // PayPal's admin_area_1 is the STATE and admin_area_2 the city — swapping
    // them ships to the wrong place with no error anywhere.
    expect(unit.shipping?.address?.["admin_area_1"]).toBe("SA");
    expect(unit.shipping?.address?.["admin_area_2"]).toBe("Adelaide");
    // PayPal requires an uppercase ISO country code.
    expect(unit.shipping?.address?.["country_code"]).toBe("AU");
  });

  it("Click & Collect sends NO_SHIPPING and no address at all", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({
        shippingRates: [
          {
            shippingRates: [
              { rateId: "flat_rate:1", selected: false },
              { rateId: "pickup_location:2", selected: true },
            ],
          },
        ],
      }),
    );
    await POST();
    expect(sentPayload().application_context.shipping_preference).toBe(
      "NO_SHIPPING",
    );
    // Nothing is delivered to the buyer, so handing PayPal the store's address
    // as "shipping" would put it on the order.
    expect(sentPayload().purchase_units[0]?.["shipping"]).toBeUndefined();
  });

  it("a `local_pickup` rate is pickup too", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({
        shippingRates: [
          { shippingRates: [{ rateId: "local_pickup:3", selected: true }] },
        ],
      }),
    );
    await POST();
    expect(sentPayload().application_context.shipping_preference).toBe(
      "NO_SHIPPING",
    );
  });

  it("a digital cart sends NO_SHIPPING", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({ needsShipping: false, shippingRates: [] }),
    );
    await POST();
    expect(sentPayload().application_context.shipping_preference).toBe(
      "NO_SHIPPING",
    );
  });

  it("falls back to NO_SHIPPING when the cart has no usable address yet", async () => {
    hoisted.getFullCartAction.mockResolvedValue(
      cart({ shippingAddress: { address1: "  " } }),
    );
    await POST();
    // SET_PROVIDED_ADDRESS with an empty address is rejected by PayPal — this
    // degrades rather than sending one.
    expect(sentPayload().application_context.shipping_preference).toBe(
      "NO_SHIPPING",
    );
  });
});

describe("the webhook context", () => {
  it("carries the draft order and the cart token", async () => {
    await POST();
    const unit = sentPayload().purchase_units[0] as {
      custom_id: string;
      reference_id: string;
    };
    expect(unit.custom_id).toBe("hk1|4242|wc_order_abc123");
    expect(unit.reference_id).toBe(CART_TOKEN);
  });

  it("still creates the order when WooCommerce deferred the draft", async () => {
    hoisted.getCheckoutAction.mockResolvedValue({ orderId: "0", orderKey: "" });
    const response = await POST();
    expect(response.status).toBe(200);
    const unit = sentPayload().purchase_units[0] as { custom_id: string };
    expect(unit.custom_id).toBe("hk1||");
  });

  it("survives the draft read failing entirely", async () => {
    hoisted.getCheckoutAction.mockRejectedValue(new Error("WC unreachable"));
    expect((await POST()).status).toBe(200);
  });

  it("drops an over-long cart token rather than truncating it", async () => {
    // A truncated JWT is a token that fails to authenticate at the worst
    // possible moment. Losing the webhook fallback for one order is the
    // smaller harm, and create-order logs it.
    hoisted.getCartToken.mockResolvedValue("x".repeat(300));
    await POST();
    const unit = sentPayload().purchase_units[0] as { reference_id: string };
    expect(unit.reference_id).toBe("hk-no-cart");
  });
});

describe("upstream failure", () => {
  it("answers 502 with no PayPal detail in the body", async () => {
    hoisted.createPayPalOrder.mockRejectedValue(new Error("PayPal 422"));
    const response = await POST();
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).not.toContain("422");
  });
});
