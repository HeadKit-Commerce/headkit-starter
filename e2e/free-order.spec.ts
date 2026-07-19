import { test, expect } from "@playwright/test";

/**
 * Free-order (zero-total) + express/wallet checkout e2e (PAY-05 / PAY-06).
 *
 * LOCAL-ONLY (HARD RULE): targets the local Docker stack only
 * (storefront :3000, Hive gateway :4000). No prod/staging.
 *
 * Like the other Phase-3/4 specs, this does NOT spawn the app via Playwright's
 * `webServer` — the full local stack (WordPress+WC, MongoDB, commerce subgraph,
 * Hive gateway, starter) must be brought up out-of-band first (STATE.md
 * decision 03-01). It also does NOT mock the WP/Go layer.
 *
 * ── PAY-05 (free order) ──────────────────────────────────────────────────
 * A cart with items but a $0 total (e.g. a 100%-off coupon, gift, or free
 * sample) must reach a NO-PAYMENT confirm — NOT the "No products in your cart!"
 * empty-cart message — and, on confirm, place the order and land on the
 * order success page (`/checkout/success/{orderId}`). The Stripe
 * CheckoutProvider must never mount for a free order; the server-side
 * zero-total bypass (CreateCheckoutSession → ProcessCheckoutOrder, no Stripe
 * session) finalizes the WC order.
 *
 * SEEDING (PAY-05): a guest session whose cart has ≥1 item and a $0 total.
 * The simplest local recipe is a normal cart + a 100%-off coupon applied
 * (see e2e/fixtures/seed-customers.md). Export when available:
 *   - E2E_FREE_CART_TOKEN   (a cart token whose total is "0" with items), OR
 *   - run the UI seeding steps in the fixtures doc.
 * When the seed/stack is absent these tests FAIL LOUDLY (they assert the
 * no-payment confirm renders), they do not silently pass.
 *
 * ── PAY-06 (express / wallet) ────────────────────────────────────────────
 * The checkout mounts a single <ExpressCheckoutElement> (Apple Pay / Google Pay
 * / Link) at the TOP of the page, above the contact step, inside the
 * CheckoutProvider context (components/checkout/express-checkout-top.tsx). It is
 * wrapped in a `[data-testid="express-checkout"]` container that is in the DOM
 * from page load for a paid cart (no longer gated behind reaching the payment
 * step). Stripe allows only ONE ExpressCheckoutElement per CheckoutProvider, so
 * it is NOT also mounted in the payment step.
 *
 * IMPORTANT — MANUAL GATE: the actual Apple/Google Pay BUTTON only renders when
 * BOTH (a) the buyer's browser/device advertises a wallet AND (b) the storefront
 * domain is VERIFIED with Stripe (a Stripe-dashboard prerequisite, INFRA-06).
 * Neither is available in this local Playwright run (headless Chromium has no
 * provisioned wallet; localhost is not a Stripe-verified domain). So the
 * wallet-BUTTON assertion is a DOCUMENTED MANUAL GATE: this spec asserts the
 * express-checkout MOUNT POINT is present (the code path is wired, no version
 * bump), and the live button-visibility check is deferred to the manual phase
 * gate once INFRA-06 domain verification is in place.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// A cart token whose server-side total is "0" but with ≥1 item (free order).
// See e2e/fixtures/seed-customers.md for how to produce one locally.
const FREE_CART_TOKEN = process.env.E2E_FREE_CART_TOKEN ?? "";

test.describe("Free order (zero total) — no payment step (PAY-05)", () => {
  test.beforeAll(() => {
    expect(
      FREE_CART_TOKEN,
      "E2E_FREE_CART_TOKEN is empty — seed a local cart with items and a $0 total (e.g. apply a 100%-off coupon; see e2e/fixtures/seed-customers.md) and bring the local stack up. This spec does NOT mock.",
    ).not.toBe("");
  });

  test("a $0-total cart shows a no-payment confirm, NOT the empty-cart message", async ({
    page,
    context,
  }) => {
    // Attach the seeded free-order cart token so /checkout resolves the cart.
    await context.addCookies([
      {
        name: "hk-cart-token",
        value: FREE_CART_TOKEN,
        url: BASE_URL,
      },
    ]);

    await page.goto(`${BASE_URL}/checkout`);

    // PAY-05 guard split: the empty-cart copy must NOT appear for a free order.
    await expect(
      page.getByText("No products in your cart!"),
      "free order incorrectly rendered the empty-cart message (PAY-05: the $0-total cart-with-items branch was swallowed by the empty-cart guard)",
    ).toHaveCount(0);

    // The no-payment confirm must render instead.
    await expect(
      page.getByText("No payment required"),
      "free order did NOT render the no-payment confirm (PAY-05)",
    ).toBeVisible();

    // No Stripe payment UI for a free order (no CheckoutProvider mount).
    await expect(
      page.locator('[data-testid="express-checkout"]'),
      "a Stripe payment element mounted for a free order — it must not (PAY-05)",
    ).toHaveCount(0);
  });

  test("confirming a free order places it and lands on the success page", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "hk-cart-token",
        value: FREE_CART_TOKEN,
        url: BASE_URL,
      },
    ]);

    await page.goto(`${BASE_URL}/checkout`);
    await expect(page.getByText("No payment required")).toBeVisible();

    // ENG-838: WC requires a full billing address + email even for $0 orders
    // (woocommerce_rest_invalid_address); the free-order confirm collects a
    // minimal billing form (guest cart has none → must be typed).
    await page
      .getByLabel(/email for your order confirmation/i)
      .fill("free-order-e2e@local.test");
    await page.getByLabel(/first name/i).fill("Free");
    await page.getByLabel(/last name/i).fill("Order");
    await page.getByLabel(/street address/i).fill("1 Test St");
    await page.getByLabel(/suburb/i).fill("Melbourne");
    await page.getByLabel(/^state$/i).fill("VIC");
    await page.getByLabel(/postcode/i).fill("3000");

    await page.getByRole("button", { name: /place order/i }).click();

    // The server-side zero-total bypass finalizes the order, then the storefront
    // routes to /checkout/success/{orderId}?key={orderKey}.
    await page.waitForURL(/\/checkout\/success\/.+/, { timeout: 30_000 });
    expect(
      page.url(),
      "free order did not reach the order success page after confirm (PAY-05)",
    ).toMatch(/\/checkout\/success\//);
  });
});

test.describe("Express / wallet checkout presence (PAY-06)", () => {
  // The cart token here is a PAID cart (≥1 item, non-zero total) so the
  // checkout reaches the Stripe payment step where the express element mounts.
  const PAID_CART_TOKEN = process.env.E2E_PAID_CART_TOKEN ?? "";

  test.beforeAll(() => {
    expect(
      PAID_CART_TOKEN,
      "E2E_PAID_CART_TOKEN is empty — seed a local cart with items and a non-zero total (see e2e/fixtures/seed-customers.md) so the checkout reaches the payment step. This spec does NOT mock.",
    ).not.toBe("");
  });

  test("the express/wallet mount point is present at the top of checkout (button visibility is a manual gate)", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "hk-cart-token",
        value: PAID_CART_TOKEN,
        url: BASE_URL,
      },
    ]);

    await page.goto(`${BASE_URL}/checkout`);

    // Mounted at the top of the page from load (no step navigation needed): the
    // express checkout container must be wired into the DOM for a paid cart.
    const express = page.locator('[data-testid="express-checkout"]');
    await expect(
      express,
      "express/wallet checkout mount point is missing from the top of checkout (PAY-06 — ExpressCheckoutElement not wired)",
    ).toBeAttached({ timeout: 30_000 });

    // MANUAL GATE (INFRA-06): the actual Apple/Google Pay button only renders
    // after Stripe domain verification + a wallet-capable device. That live
    // visibility check is deferred to the manual phase gate; here we only prove
    // the code path is mounted. To run the live check, set
    // E2E_WALLET_DOMAIN_VERIFIED=1 against a verified domain on a wallet device.
    if (process.env.E2E_WALLET_DOMAIN_VERIFIED === "1") {
      await expect(
        express.locator("iframe"),
        "wallet button did not render despite E2E_WALLET_DOMAIN_VERIFIED=1 (check Stripe domain verification / device wallet — INFRA-06)",
      ).toBeVisible({ timeout: 30_000 });
    }
  });
});
