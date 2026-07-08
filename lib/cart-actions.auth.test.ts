import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Layer 4a — cart-actions reads the `hk-auth-token` cookie server-side and
 * forwards it to the SDK so a logged-in shopper's cart/checkout calls are
 * user-scoped (CKA-03). Guest (no cookie) → authToken undefined → no
 * Authorization header (guest path unchanged). Token handling threat: the
 * token is only read server-side and forwarded via the SDK; never logged
 * (CKA-07 / T-04.1-11).
 *
 * Mocks the boundaries (next/headers cookies, @/lib/cart, @/lib/sdk.server)
 * per the node-vitest style used by address-form.test.ts — no real network.
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
  cartTokenCookieOptions: () => ({ name: "hk-cart-token", path: "/" }),
}));

vi.mock("@/lib/sdk.server", () => ({
  createServerHeadkit: (...args: unknown[]) => createServerHeadkitMock(...args),
}));

/** Minimal SDK stub whose cart methods resolve to a cart carrying a token. */
function fakeSdk(): {
  cart: { get: ReturnType<typeof vi.fn>; addItem: ReturnType<typeof vi.fn> };
} {
  const cart = { key: "1", token: "ct-new" };
  return {
    cart: {
      get: vi.fn().mockResolvedValue(cart),
      addItem: vi.fn().mockResolvedValue(cart),
    },
  };
}

/** Map cookie name → value for a given test scenario. */
function stubCookies(values: Record<string, string>): void {
  cookieGetMock.mockImplementation((name: string) =>
    name in values ? { value: values[name] } : undefined,
  );
}

let getFullCartAction: typeof import("./cart-actions").getFullCartAction;
let addToCartAction: typeof import("./cart-actions").addToCartAction;

beforeEach(async () => {
  vi.clearAllMocks();
  createServerHeadkitMock.mockReturnValue(fakeSdk());
  getCartTokenMock.mockReturnValue("ct");
  const mod = await import("./cart-actions");
  getFullCartAction = mod.getFullCartAction;
  addToCartAction = mod.addToCartAction;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cart-actions forwards hk-auth-token (CKA-03)", () => {
  it("Test D: getFullCartAction passes the hk-auth-token cookie as authToken", async () => {
    stubCookies({ "hk-auth-token": "jwt-x" });

    await getFullCartAction();

    // createServerHeadkit(cartToken, klaviyoId, authToken) — authToken is arg #2.
    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[0]).toBe("ct");
    expect(call?.[2]).toBe("jwt-x");
  });

  it("Test D (guest): absent cookie → authToken undefined (no Authorization)", async () => {
    stubCookies({});

    await getFullCartAction();

    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[0]).toBe("ct");
    expect(call?.[2]).toBeUndefined();
  });

  it("shared withCartRetry path forwards authToken (and klaviyoId) to the SDK", async () => {
    stubCookies({ "hk-auth-token": "jwt-x", __kla_id: "kla1" });

    await addToCartAction({ productId: 1, quantity: 1 } as never);

    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[0]).toBe("ct");
    expect(call?.[1]).toBe("kla1");
    expect(call?.[2]).toBe("jwt-x");
  });

  it("shared withCartRetry path guest: no auth cookie → authToken undefined", async () => {
    stubCookies({ __kla_id: "kla1" });

    await addToCartAction({ productId: 1, quantity: 1 } as never);

    const call = createServerHeadkitMock.mock.calls[0];
    expect(call?.[2]).toBeUndefined();
  });
});
