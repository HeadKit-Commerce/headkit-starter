import { describe, expect, it } from "vitest";

import {
  resolveCheckoutEmail,
  type CheckoutEmailCart,
} from "@/lib/checkout-email";

/**
 * Layer 4b — resolveCheckoutEmail (CKA-04).
 *
 * The recreated Stripe Checkout Session must carry a real `customer_email` so
 * the ContactDetailsElement prefills and Link initiates on load (and survives a
 * page reload). page.tsx currently passes `undefined`. This pure helper decides
 * which email to hand `createCheckoutSessionAction`, with precedence:
 *   1. the user-scoped cart's billing email (A1 — the authed Store API cart
 *      natively surfaces the WP user's saved billing address);
 *   2. a caller-derived fallback email (e.g. getCustomer(authToken).email);
 *   3. undefined — guest / no auth → session stays guest (unchanged).
 *
 * Pure/node-testable, mirroring lib/address-form.ts (the app has no
 * jsdom/testing-library setup — logic is extracted for the node vitest env).
 */

const cartWith = (email: string | null | undefined): CheckoutEmailCart => ({
  billingAddress: { email },
});

describe("resolveCheckoutEmail (CKA-04)", () => {
  it("returns the cart billing email when present", () => {
    expect(resolveCheckoutEmail(cartWith("shopper@example.com"))).toBe(
      "shopper@example.com",
    );
  });

  it("prefers the cart billing email over the fallback", () => {
    expect(
      resolveCheckoutEmail(
        cartWith("cart@example.com"),
        "fallback@example.com",
      ),
    ).toBe("cart@example.com");
  });

  it("falls back to the caller-derived email when the cart has no billing email", () => {
    expect(resolveCheckoutEmail(cartWith(null), "fallback@example.com")).toBe(
      "fallback@example.com",
    );
    expect(resolveCheckoutEmail(cartWith(""), "fallback@example.com")).toBe(
      "fallback@example.com",
    );
  });

  it("returns undefined for a guest (no cart email, no fallback)", () => {
    expect(resolveCheckoutEmail(cartWith(null))).toBeUndefined();
    expect(resolveCheckoutEmail(null)).toBeUndefined();
    expect(resolveCheckoutEmail(undefined)).toBeUndefined();
  });

  it('normalizes empty/whitespace values to undefined (never passes "")', () => {
    expect(resolveCheckoutEmail(cartWith("   "))).toBeUndefined();
    expect(resolveCheckoutEmail(cartWith(""), "   ")).toBeUndefined();
  });

  it("trims surrounding whitespace on the resolved email", () => {
    expect(resolveCheckoutEmail(cartWith("  a@b.com  "))).toBe("a@b.com");
    expect(resolveCheckoutEmail(cartWith(null), "  f@g.com  ")).toBe("f@g.com");
  });
});
