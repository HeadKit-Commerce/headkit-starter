import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CKA-06 — the checkout server actions read the `hk-auth-token` cookie
 * server-side and forward it (as `Authorization: Bearer`, SDK arg #3) so the
 * WC draft order these calls create/finalize is stamped with the real
 * customer_id (not 0). Guest (no cookie) → authToken undefined → guest path
 * unchanged. The token is only read server-side and forwarded via the SDK;
 * never logged (T-04.1-15).
 *
 * Mocks the boundaries (next/headers cookies, @/lib/cart, @/lib/sdk.server) per
 * the node-vitest style used by cart-actions.auth.test.ts — no real network.
 */

const createServerHeadkitMock = vi.fn();
const getCartTokenMock = vi.fn();
const cookieGetMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookieGetMock,
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/cart", () => ({
  getCartToken: () => getCartTokenMock(),
}));

vi.mock("@/lib/sdk.server", () => ({
  createServerHeadkit: (...args: unknown[]) => createServerHeadkitMock(...args),
}));

/** Minimal SDK stub covering the checkout/payments/cart domains under test. */
function fakeSdk(): unknown {
  const ok = vi.fn().mockResolvedValue({});
  return {
    payments: {
      createCheckoutSession: ok,
      syncCheckoutSessionLineItems: ok,
    },
    cart: { updateCustomer: ok, selectShipping: ok },
    checkout: { get: ok, process: ok, processCheckoutOrder: ok },
  };
}

function stubCookies(values: Record<string, string>): void {
  cookieGetMock.mockImplementation((name: string) =>
    name in values ? { value: values[name] } : undefined,
  );
}

let actions: typeof import("./actions");

beforeEach(async () => {
  vi.clearAllMocks();
  createServerHeadkitMock.mockReturnValue(fakeSdk());
  getCartTokenMock.mockReturnValue("ct");
  actions = await import("./actions");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkout actions forward hk-auth-token (CKA-06)", () => {
  it("createCheckoutSessionAction forwards the JWT as SDK arg #3", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.createCheckoutSessionAction("https://return");
    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[0]).toBe("ct");
    expect(call?.[2]).toBe("jwt-x");
  });

  // ENG-801: guest sessions must be created email-LESS. Stripe renders a
  // session's `customer_email` as "prefilled and not editable" — pinning the
  // cart email at create locked the ContactDetailsElement input on reload /
  // recreate. The email now reaches the session client-side via
  // actions.updateEmail. This structurally proves the guest create input
  // carries neither `customerEmail` nor an accidental positional-shift
  // `customer` id, while the other options still land on the right keys.
  it("guest create: SDK input has neither customerEmail nor customer (ENG-801)", async () => {
    stubCookies({});
    await actions.createCheckoutSessionAction(
      "https://return",
      undefined,
      ["AU", "NZ"],
      "https://base",
    );
    const sdk = createServerHeadkitMock.mock.results[0]?.value as {
      payments: { createCheckoutSession: ReturnType<typeof vi.fn> };
    };
    const input = sdk.payments.createCheckoutSession.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty("customerEmail");
    expect(input).not.toHaveProperty("customer");
    expect(input?.allowedShippingCountries).toEqual(["AU", "NZ"]);
    expect(input?.successBaseUrl).toBe("https://base");
  });

  it("updateCustomerAction forwards the JWT (draft-order attribution path)", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.updateCustomerAction({} as never);
    expect(createServerHeadkitMock.mock.calls[0]?.[2]).toBe("jwt-x");
  });

  it("selectShippingRateAction forwards the JWT", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.selectShippingRateAction("pkg", "rate");
    expect(createServerHeadkitMock.mock.calls[0]?.[2]).toBe("jwt-x");
  });

  it("getCheckoutAction forwards the JWT", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.getCheckoutAction();
    expect(createServerHeadkitMock.mock.calls[0]?.[2]).toBe("jwt-x");
  });

  it("processCheckoutAction forwards the JWT (finalize path)", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.processCheckoutAction({} as never);
    expect(createServerHeadkitMock.mock.calls[0]?.[2]).toBe("jwt-x");
  });

  it("processCheckoutOrderAction forwards the JWT (draft-order finalize)", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });
    await actions.processCheckoutOrderAction("ct", "42", "key", {} as never);
    expect(createServerHeadkitMock.mock.calls[0]?.[2]).toBe("jwt-x");
  });

  it("guest: absent cookie → authToken undefined (guest path unchanged)", async () => {
    stubCookies({});
    await actions.createCheckoutSessionAction("https://return");
    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[0]).toBe("ct");
    expect(call?.[2]).toBeUndefined();
  });
});
