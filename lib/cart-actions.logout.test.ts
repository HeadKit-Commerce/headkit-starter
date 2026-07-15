import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Logout must drop the `hk-cart-token` cookie. The WP theme now resolves the
 * WP user from the Cart-Token itself (session identity unification — see
 * .planning/debug/stripe-shipping-desync-logged-in.md), so a cart token left
 * behind after logout would keep acting as the logged-out user on every
 * wc/store request. `clearCartTokenAction` is the server-side half (the
 * cookie is httpOnly); auth-context's signOut calls it.
 *
 * Mock style mirrors cart-actions.auth.test.ts.
 */

const createServerHeadkitMock = vi.fn();
const getCartTokenMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieDeleteMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookieGetMock,
    set: vi.fn(),
    delete: cookieDeleteMock,
  }),
}));

vi.mock("@/lib/cart", () => ({
  getCartToken: () => getCartTokenMock(),
  cartTokenCookieOptions: () => ({ name: "hk-cart-token", path: "/" }),
}));

vi.mock("@/lib/sdk.server", () => ({
  createServerHeadkit: (...args: unknown[]) => createServerHeadkitMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clearCartTokenAction (logout cart-token rotation)", () => {
  it("deletes the hk-cart-token cookie (name from cartTokenCookieOptions)", async () => {
    const { clearCartTokenAction } = await import("./cart-actions");

    await clearCartTokenAction();

    expect(cookieDeleteMock).toHaveBeenCalledWith("hk-cart-token");
  });
});
