import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **Placing an UNPAID WooCommerce order against an offline gateway.**
 *
 * WHAT THIS COVERS: every decision `lib/offline-order.ts` makes — the gateway
 * the client asked for being validated against the CART, the addresses being
 * read from the cart rather than the request, the draft order being adopted
 * when one exists and created only when WooCommerce deferred it, the absence
 * of any `payment_data` (there is no payment), and each refusal.
 *
 * WHERE IT STOPS: the SDK is mocked at the action boundary
 * (`@/app/checkout/actions`), so it says nothing about what WooCommerce does
 * with the call — that the order lands `on-hold` and that the gateway's own
 * instructions go out on the order email are WooCommerce core behaviour, and
 * the PR's evidence is what shows them. It also says nothing about the Stripe
 * session being retired, which lives in the action wrapper
 * (`app/checkout/offline-order-actions.ts`), or about anything rendered.
 */

const hoisted = vi.hoisted(() => ({
  cart: null as unknown,
  cartToken: "ck_live_1" as string | null,
  draft: null as unknown,
  draftThrows: false,
  session: null as unknown,
  sessionThrows: false,
  cookies: {} as Record<string, string>,
  processCheckout: vi.fn(),
  processCheckoutOrder: vi.fn(),
}));

vi.mock("@/lib/cart", () => ({
  getCartToken: async () => hoisted.cartToken,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      hoisted.cookies[name] === undefined
        ? undefined
        : { name, value: hoisted.cookies[name] },
  }),
}));
vi.mock("@/lib/cart-actions", () => ({
  getFullCartAction: async () => hoisted.cart,
}));
vi.mock("@/app/checkout/actions", () => ({
  getCheckoutAction: async () => {
    if (hoisted.draftThrows) throw new Error("draft read failed");
    return hoisted.draft;
  },
  getCheckoutSessionAction: async () => {
    if (hoisted.sessionThrows) throw new Error("session read failed");
    return hoisted.session;
  },
  // DELEGATED, not passed by reference: `beforeEach` swaps these mocks per
  // test, and a factory that captured the function object would keep calling
  // the first one forever.
  processCheckoutAction: (...args: unknown[]) =>
    hoisted.processCheckout(...args),
  processCheckoutOrderAction: (...args: unknown[]) =>
    hoisted.processCheckoutOrder(...args),
}));

const {
  placeOfflineOrder,
  shopperFacingOrderError,
  OfflineGatewayNotOfferedError,
} = await import("./offline-order");

const ADDRESS = {
  firstName: "Ada",
  lastName: "Lovelace",
  address1: "1 Rundle Mall",
  address2: "",
  city: "Adelaide",
  state: "SA",
  postcode: "5000",
  country: "AU",
  phone: "0400000000",
  email: "ada@example.com",
};

function cart(overrides: Record<string, unknown> = {}) {
  return {
    itemsCount: 2,
    paymentMethods: ["headkit-payments", "bacs"],
    needsShipping: true,
    shippingRates: [{ shippingRates: [{ selected: true }] }],
    billingAddress: ADDRESS,
    shippingAddress: { ...ADDRESS, address1: "2 King William St" },
    ...overrides,
  };
}

beforeEach(() => {
  hoisted.cart = cart();
  hoisted.cartToken = "ck_live_1";
  hoisted.draft = null;
  hoisted.draftThrows = false;
  hoisted.session = null;
  hoisted.sessionThrows = false;
  hoisted.cookies = {};
  hoisted.processCheckout = vi.fn(async () => ({
    orderId: "4242",
    orderKey: "wc_order_new",
  }));
  hoisted.processCheckoutOrder = vi.fn(async () => ({
    orderId: "1234",
    orderKey: "wc_order_draft",
  }));
});

describe("the gateway id is the CART's decision, not the client's", () => {
  it("places the order when the cart offers that gateway", async () => {
    await expect(placeOfflineOrder("bacs")).resolves.toMatchObject({
      orderId: "4242",
      gatewayId: "bacs",
    });
  });

  it("refuses a gateway the cart does not offer", async () => {
    // Without this a client could name any gateway id it liked — including one
    // the merchant disabled precisely because it takes no money.
    await expect(placeOfflineOrder("cod")).rejects.toBeInstanceOf(
      OfflineGatewayNotOfferedError,
    );
    expect(hoisted.processCheckout).not.toHaveBeenCalled();
  });

  it("refuses Stripe's and the quote gateway through this path", async () => {
    hoisted.cart = cart({
      paymentMethods: ["headkit-payments", "headkit-quote", "bacs"],
    });
    for (const id of ["headkit-payments", "headkit-quote", "", "   "]) {
      await expect(placeOfflineOrder(id)).rejects.toBeInstanceOf(
        OfflineGatewayNotOfferedError,
      );
    }
    expect(hoisted.processCheckout).not.toHaveBeenCalled();
  });
});

describe("what the order is finalized with", () => {
  it("sends the chosen gateway id and NO payment data", async () => {
    // There is no payment. A `payment_status: paid` key here would tell the
    // merchant an unreconciled order had been paid for.
    await placeOfflineOrder("bacs");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.paymentMethod).toBe("bacs");
    expect(input).not.toHaveProperty("paymentData");
  });

  it("takes the addresses from the CART, both of them", async () => {
    await placeOfflineOrder("bacs");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.billingAddress).toMatchObject({
      address1: "1 Rundle Mall",
      email: "ada@example.com",
    });
    expect(input.shippingAddress).toMatchObject({
      address1: "2 King William St",
    });
  });

  it("falls back to the other address when one is unusable", async () => {
    // WooCommerce requires both, and a pickup order has no separate delivery
    // address — an empty one is a rejected order.
    hoisted.cart = cart({ shippingAddress: { ...ADDRESS, address1: "" } });
    await placeOfflineOrder("bacs");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.shippingAddress.address1).toBe("1 Rundle Mall");
  });
});

describe("Click & Collect: the addresses live on the STRIPE SESSION", () => {
  // MEASURED against the rehearsal store: on Click & Collect the shopper's
  // details go to the Stripe session at Contact and Billing and never reach
  // the WooCommerce cart, so a cart-only read finalizes with empty addresses
  // and WooCommerce answers `woocommerce_rest_invalid_address`.
  const SESSION = {
    customerEmail: "ada@example.com",
    billingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "274 Waymouth Street",
      address2: "",
      city: "Adelaide",
      state: "SA",
      postcode: "5000",
      country: "AU",
      phone: "0412345678",
      email: null,
    },
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "9 Pickup Lane",
      address2: "",
      city: "Adelaide",
      state: "SA",
      postcode: "5000",
      country: "AU",
      phone: "0412345678",
    },
  };

  beforeEach(() => {
    hoisted.cart = cart({ billingAddress: null, shippingAddress: null });
    hoisted.session = SESSION;
  });

  it("prefers the BILLING COOKIE over the session's stale customer_details", async () => {
    // ENG-801: the session retrieve lags `updateBillingAddress()` by tens of
    // seconds, which is why the Billing step writes this cookie at all.
    hoisted.cookies["hk-billing-address"] = encodeURIComponent(
      JSON.stringify({
        firstName: "Grace",
        lastName: "Hopper",
        address1: "1 Cookie Street",
        city: "Adelaide",
        state: "SA",
        postcode: "5000",
        country: "AU",
      }),
    );
    await placeOfflineOrder("bacs", "cs_test_1");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.billingAddress.address1).toBe("1 Cookie Street");
  });

  it("takes shipping and email from the checkout-data cookie", async () => {
    hoisted.cookies["hk-checkout-data"] = encodeURIComponent(
      JSON.stringify({
        email: "grace@example.com",
        shippingAddress: {
          firstName: "Grace",
          lastName: "Hopper",
          address1: "2 Cookie Lane",
          city: "Adelaide",
          state: "SA",
          postcode: "5000",
          country: "AU",
        },
      }),
    );
    await placeOfflineOrder("bacs", "cs_test_1");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.shippingAddress.address1).toBe("2 Cookie Lane");
    // The cookie's email beats the session's for the same reason its address
    // does: it is what this checkout just wrote, not what Stripe has caught
    // up to.
    expect(input.billingAddress.email).toBe("grace@example.com");
  });

  it("ignores a malformed cookie rather than failing the order", async () => {
    hoisted.cookies["hk-billing-address"] = "%7Bnot json";
    hoisted.cookies["hk-checkout-data"] = "{{{";
    await expect(placeOfflineOrder("bacs", "cs_test_1")).resolves.toMatchObject(
      { orderId: "4242" },
    );
  });

  it("falls back to the session when the cart has no address", async () => {
    await placeOfflineOrder("bacs", "cs_test_1");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.billingAddress).toMatchObject({
      address1: "274 Waymouth Street",
      city: "Adelaide",
      postcode: "5000",
      email: "ada@example.com",
    });
    expect(input.shippingAddress).toMatchObject({
      address1: "9 Pickup Lane",
    });
  });

  it("still prefers the CART when it has one — rates were quoted on it", async () => {
    hoisted.cart = cart();
    await placeOfflineOrder("bacs", "cs_test_1");
    const input = hoisted.processCheckout.mock.calls[0]?.[0];
    expect(input.billingAddress.address1).toBe("1 Rundle Mall");
  });

  it("refuses rather than sending WooCommerce an empty address", async () => {
    // The failure this replaces was a 400 the shopper could not act on.
    hoisted.session = null;
    await expect(placeOfflineOrder("bacs", "cs_test_1")).rejects.toThrow(
      /could not read your address/i,
    );
    expect(hoisted.processCheckout).not.toHaveBeenCalled();
  });

  it("survives a session read that fails, when the cart can cover it", async () => {
    hoisted.cart = cart();
    hoisted.sessionThrows = true;
    await expect(placeOfflineOrder("bacs", "cs_test_1")).resolves.toMatchObject(
      { orderId: "4242" },
    );
  });
});

describe("the draft order is adopted, never duplicated", () => {
  it("processes the existing draft when the session left one", async () => {
    hoisted.draft = { orderId: "1234", orderKey: "wc_order_draft" };
    await expect(placeOfflineOrder("bacs")).resolves.toMatchObject({
      orderId: "1234",
      orderKey: "wc_order_draft",
    });
    expect(hoisted.processCheckoutOrder).toHaveBeenCalledOnce();
    // The whole point: creating here is how one cart becomes two orders.
    expect(hoisted.processCheckout).not.toHaveBeenCalled();
  });

  it('treats WooCommerce\'s "0" sentinel as no draft at all', async () => {
    hoisted.draft = { orderId: "0", orderKey: "wc_order_draft" };
    await placeOfflineOrder("bacs");
    expect(hoisted.processCheckout).toHaveBeenCalledOnce();
  });

  it("creates when WooCommerce 10.8+ deferred the draft", async () => {
    hoisted.draft = { orderId: null, orderKey: null };
    await placeOfflineOrder("bacs");
    expect(hoisted.processCheckout).toHaveBeenCalledOnce();
  });

  it("still places the order when the draft read itself fails", async () => {
    hoisted.draftThrows = true;
    await expect(placeOfflineOrder("bacs")).resolves.toMatchObject({
      orderId: "4242",
    });
  });

  it("routes a double submit to the order that already exists", async () => {
    hoisted.draft = { orderId: "1234", orderKey: "wc_order_draft" };
    hoisted.processCheckoutOrder = vi.fn(async () => {
      throw new Error("This order has already been paid for.");
    });
    await expect(placeOfflineOrder("bacs")).resolves.toMatchObject({
      orderId: "1234",
      orderKey: "wc_order_draft",
    });
  });

  it("rethrows a real finalize failure", async () => {
    hoisted.draft = { orderId: "1234", orderKey: "wc_order_draft" };
    hoisted.processCheckoutOrder = vi.fn(async () => {
      throw new Error("woocommerce_rest_invalid_postcode");
    });
    await expect(placeOfflineOrder("bacs")).rejects.toThrow(/invalid_postcode/);
  });
});

describe("the refusals that protect the shopper", () => {
  it("refuses with no cart session", async () => {
    hoisted.cartToken = null;
    await expect(placeOfflineOrder("bacs")).rejects.toThrow(/expired/i);
  });

  it("refuses an empty cart", async () => {
    hoisted.cart = cart({ itemsCount: 0 });
    await expect(placeOfflineOrder("bacs")).rejects.toThrow(/empty/i);
  });

  it("refuses a shippable cart with no rate chosen, in words", async () => {
    // WooCommerce would reject it with a REST error the shopper cannot act on.
    hoisted.cart = cart({ shippingRates: [{ shippingRates: [] }] });
    await expect(placeOfflineOrder("bacs")).rejects.toThrow(/delivery option/i);
    expect(hoisted.processCheckout).not.toHaveBeenCalled();
  });

  it("does not ask for a rate when nothing needs shipping", async () => {
    hoisted.cart = cart({ needsShipping: false, shippingRates: [] });
    await expect(placeOfflineOrder("bacs")).resolves.toMatchObject({
      orderId: "4242",
    });
  });

  it('refuses to call an order placed when WooCommerce answered "0"', async () => {
    hoisted.processCheckout = vi.fn(async () => ({
      orderId: "0",
      orderKey: "",
    }));
    await expect(placeOfflineOrder("bacs")).rejects.toThrow(
      /confirmation email/i,
    );
  });
});

describe("shopperFacingOrderError", () => {
  // MEASURED on the rehearsal store: WooCommerce Conditional Shipping and
  // Payments restricts this gateway by order total, and the rejection arrives
  // with the whole cart payload attached.
  const WOO_409 =
    "WooCommerce checkout error (/wp-json/wc/store/v1/checkout) status 409: " +
    JSON.stringify({
      code: "woocommerce-conditional-shipping-and-payments-error-payment_gateways-0",
      message:
        'Your order cannot be checked out via "Pay by bank". To complete your order via "Pay by bank", please increase your order total to $1,000.00 or higher. Otherwise, choose a different payment method.',
      data: { status: 409, cart: { items: [{ sku: "50226" }] } },
    });

  it("shows WooCommerce's own sentence, not the payload around it", () => {
    const text = shopperFacingOrderError(new Error(WOO_409));
    expect(text).toContain("increase your order total to $1,000.00");
    // The cart payload must not reach the screen.
    expect(text).not.toContain("sku");
    expect(text).not.toContain("{");
  });

  it("falls back to a generic sentence for a body it cannot read", () => {
    expect(shopperFacingOrderError(new Error("boom {not json"))).toBe(
      "Could not place your order. Please try again.",
    );
    expect(shopperFacingOrderError(null)).toBe(
      "Could not place your order. Please try again.",
    );
  });

  it("passes our own deliberate sentences through untouched", () => {
    const own = "Choose a delivery option before placing this order.";
    expect(shopperFacingOrderError(new Error(own))).toBe(own);
  });
});
