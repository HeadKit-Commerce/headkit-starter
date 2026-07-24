import { test, expect, request } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import {
  BASE_URL,
  CARD_OK,
  awaitOrderConfirmation,
  cartTotalMinor,
  fillCard,
  fillContactStep,
  fillShipToHomeStep,
  fillShippingOptionsStep,
  getStoreCart,
  installCartCookie,
  payAndAwaitSuccess,
  payButton,
  seedRegularCart,
  stackIsUp,
  stripeSessionAnyKey,
  stripeTestKeys,
  wpOrderStatus,
} from "./helpers";

/**
 * Click & Collect checkout (autonomous QA run — Gap 3, P0-06).
 *
 * The pickup-overcharge regression suite (.planning/debug/
 * stripe-pickup-overcharge.md): a pickup order must NEVER be charged a
 * shipping component, the Shipping Options step must be SKIPPED (pickup is
 * chosen at the Delivery step; step 3 becomes Billing), and the Stripe
 * session's shipping address must be the PICKUP LOCATION (ISO codes — the
 * 'Australia'→400 update-customer trap).
 *
 * Covered:
 *   1. P0-06 full paid pickup purchase: Free Click & Collect + "HeadKit
 *      Sydney Flagship" → Shipping Options step never appears → billing
 *      collected at step 3 → card payment completes. Money guard: the WC
 *      payable carries NO shipping (items-only) and the Stripe session
 *      charged EXACTLY that amount; the session shipping address is the
 *      pickup location (123 George Street, Sydney NSW 2000, AU).
 *   2. Regression: switching pickup → back to Ship to Home resurfaces the
 *      Shipping Options step and a rate is charged again (total > items).
 *
 * PREREQUISITES (self-skips when the stack is down):
 *   - local Docker stack; simple product 678 ($22)
 *   - pickup locations seeded in the local WC zone (pickup_location method —
 *     "HeadKit Sydney Flagship" / "HeadKit Melbourne Depot", seed-shipping)
 *
 * LOCAL-ONLY (HARD RULE): localhost Docker services; Stripe TEST mode only.
 */

const PICKUP_NAME = process.env.E2E_PICKUP_LOCATION ?? "HeadKit Sydney Flagship";
const PICKUP_LINE1 = "123 George Street";
const PICKUP_CITY = "Sydney";
const PICKUP_POSTCODE = "2000";
const PICKUP_STATE = "NSW";
const PICKUP_COUNTRY = "AU";

/** Locate the Stripe BillingAddressElement frame (ids are billingAddress-*). */
async function billingFrame(page: Page, timeoutMs = 30_000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (!/js\.stripe\.com/.test(frame.url())) continue;
      const n = await frame
        .locator('input[id^="billingAddress-"]')
        .count()
        .catch(() => 0);
      if (n > 0) return frame;
    }
    await page.waitForTimeout(300);
  }
  throw new Error("Stripe BillingAddressElement did not mount");
}

/** Fill the billing element + page-level phone, then Continue to Payment. */
async function fillBillingStep(page: Page): Promise<void> {
  const frame = await billingFrame(page);
  await frame.locator('input[name="name"]').fill("E2E Pickup");
  await frame.locator('select[name="country"]').selectOption("AU");
  await frame.locator('input[name="addressLine1"]').fill("9 Billing Road");
  await page.waitForTimeout(400);
  await frame
    .locator('input[name="addressLine1"]')
    .press("Escape")
    .catch(() => {});
  await frame.locator('input[name="locality"]').fill("Sydney");
  await frame.locator('input[name="postalCode"]').fill("2000");
  await frame.locator('select[name="administrativeArea"]').selectOption("NSW");
  const phone = page.getByPlaceholder("Enter phone number");
  if (await phone.isVisible().catch(() => false)) {
    await phone.fill("0412345678");
  }
  const cont = page.getByRole("button", { name: /continue to payment/i });
  await expect(
    cont,
    "Billing step Continue never enabled after filling the billing address",
  ).toBeEnabled({ timeout: 20_000 });
  await cont.click();
}

/** Select Click & Collect + a pickup location at the Delivery step, then Continue. */
async function selectPickup(page: Page, locationName: string): Promise<void> {
  await page.getByText("Free Click & Collect").click();
  const locationRadio = page
    .locator("label", { hasText: locationName })
    .first();
  await expect(
    locationRadio,
    `pickup location "${locationName}" not offered — is the pickup_location method seeded?`,
  ).toBeVisible({ timeout: 20_000 });
  await locationRadio.click();
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont).toBeEnabled({ timeout: 20_000 });
  await cont.click();
}

test.describe("Click & Collect: no shipping charged, pickup address on the session (Gap 3)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter (E2E_BASE_URL)",
    );
  });

  test("P0-06: pickup skips Shipping Options and the WC payable carries NO shipping charge", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const api = await request.newContext();
    const cartToken = await seedRegularCart(api, 1);
    await installCartCookie(context, cartToken);

    await page.goto(`${BASE_URL}/checkout`);
    await expect(page).not.toHaveURL(/\/checkout\/error/);

    await fillContactStep(page, "e2e-pickup@example.com");
    await selectPickup(page, PICKUP_NAME);

    // Step 3 is BILLING — the Shipping Options step is skipped for pickup.
    await expect(
      page.getByText("Shipping Options"),
      "Shipping Options step appeared for a pickup order — step-skip broken (P0-06)",
    ).toHaveCount(0);
    await fillBillingStep(page);
    await expect(payButton(page)).toBeVisible({ timeout: 30_000 });

    // Money guard at the WC layer: the payable is ITEMS-ONLY — the pickup
    // rate is free and no ship-to-home rate may leak in (overcharge trap).
    const cart = await getStoreCart(api, cartToken);
    const totals = cart.totals as unknown as {
      total_price: string;
      total_items: string;
      total_items_tax: string;
      total_shipping: string;
      total_shipping_tax: string;
    };
    expect(
      Number(totals.total_shipping) + Number(totals.total_shipping_tax),
      "a pickup cart carries a SHIPPING charge (pickup-overcharge regression)",
    ).toBe(0);
    expect(Number(totals.total_price)).toBe(
      Number(totals.total_items) + Number(totals.total_items_tax),
    );
    await api.dispose();
  });

  /**
   * ENG-839 — STILL BROKEN on current code; left fixme'd (Pitfall 4: no
   * force-green). Re-verified in phase 12-06 (E2E-01), 2026-07-24:
   *
   * This test (upgraded from the earlier EMPTY fixme into the full scripted
   * repro below) was run against the local stack on current code with a
   * correctly-keyed commerce (a first run failed on an env problem — commerce
   * was up with STRIPE_SECRET_KEY=sk_test_placeholder — which was fixed by
   * restarting it with .env.development.local before judging). Pay Now then
   * failed with EXACTLY the original inline Stripe error:
   *
   *   "A shipping address is required to confirm this Checkout Session.
   *    Provide a shipping address using updateShippingAddress() or use the
   *    Address Element."
   *
   * So this is a REAL product bug on the pickup path, not the
   * stale-:4000-supergraph local trap memory suspected. Original analysis
   * stands: the delivery step pushes the pickup address
   * (delivery-method-step.tsx onSubmit → actions.updateShippingAddress) and
   * advances cleanly, but the address is lost from the session before
   * confirm — most plausibly the post-step /api/checkout/sync-line-items pass
   * (commerce syncCheckoutSessionLineItems re-sets line items/fee and clears
   * shipping — the T-09-07 "shipping clear" behavior) racing/overwriting the
   * push. Ship-to-Home confirms fine on the same build
   * (checkout-purchase.spec.ts), so the wipe is pickup-specific.
   *
   * ENABLE by flipping test.fixme → test once the pickup address survives to
   * confirm (fix the wipe in the sync pass, or re-push the address after it).
   */
  test.fixme("ENG-839: pickup Pay Now confirms; charged items-only; session ships to the pickup location", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const api = await request.newContext();
    const cartToken = await seedRegularCart(api, 1);
    await installCartCookie(context, cartToken);

    await page.goto(`${BASE_URL}/checkout`);
    await expect(page).not.toHaveURL(/\/checkout\/error/);

    await fillContactStep(page, "e2e-pickup-pay@example.com");
    await selectPickup(page, PICKUP_NAME);
    await fillBillingStep(page);
    await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
    await fillCard(page, CARD_OK);

    // Authoritative payable BEFORE paying (the WC cart empties on finalize):
    // items-only — the pickup rate is free, no ship-to-home rate may leak in.
    const cart = await getStoreCart(api, cartToken);
    const totals = cart.totals as unknown as {
      total_price: string;
      total_items: string;
      total_items_tax: string;
      total_shipping: string;
      total_shipping_tax: string;
    };
    expect(
      Number(totals.total_shipping) + Number(totals.total_shipping_tax),
      "a pickup cart carries a SHIPPING charge at pay time (overcharge trap)",
    ).toBe(0);
    const payableAtPayTime = Number(totals.total_price);
    expect(payableAtPayTime).toBeGreaterThan(0);

    // THE ENG-839 moment: Pay Now must confirm — the 2026-07-18 bug surfaced
    // Stripe's inline "A shipping address is required to confirm this
    // Checkout Session" here and never navigated.
    const sessionId = await payAndAwaitSuccess(page);
    const { orderId } = await awaitOrderConfirmation(page);

    // Backend: WC order reached a paid status.
    const wcStatus = wpOrderStatus(orderId);
    if (wcStatus === null) {
      test.info().annotations.push({
        type: "warning",
        description:
          "wp-cli unavailable — WC order-status readback skipped (payment already proven via Stripe TEST API)",
      });
    } else {
      expect(
        wcStatus,
        `pickup order ${orderId} is not in a paid status after card payment`,
      ).toMatch(/processing|completed/i);
    }

    // Backend: Stripe session is TEST-mode, PAID, charged EXACTLY the
    // items-only payable, and ships to the PICKUP LOCATION (ISO codes).
    if (stripeTestKeys().length > 0) {
      const session = await stripeSessionAnyKey(api, sessionId);
      expect(session.livemode, "MUST be Stripe TEST mode (LOCAL-ONLY)").toBe(
        false,
      );
      expect(
        session.paymentStatus,
        "Stripe session is not paid after the pickup card payment",
      ).toBe("paid");
      expect(
        session.amountTotal,
        "Stripe charged amount != items-only payable (pickup overcharge)",
      ).toBe(payableAtPayTime);
      expect(
        session.shipping,
        "session carries no shipping address — the pickup location must be on the session",
      ).not.toBeNull();
      expect(session.shipping?.line1).toBe(PICKUP_LINE1);
      expect(session.shipping?.city).toBe(PICKUP_CITY);
      expect(session.shipping?.postalCode).toBe(PICKUP_POSTCODE);
      expect(session.shipping?.state).toBe(PICKUP_STATE);
      expect(session.shipping?.country).toBe(PICKUP_COUNTRY);
    }
    await api.dispose();
  });

  test("P0-06 regression: switching pickup back to Ship to Home resurfaces Shipping Options and charges a rate", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const api = await request.newContext();
    const cartToken = await seedRegularCart(api, 1);
    await installCartCookie(context, cartToken);

    await page.goto(`${BASE_URL}/checkout`);
    await fillContactStep(page, "e2e-pickup-switch@example.com");

    // At the Delivery step: pick Click & Collect + a location…
    await page.getByText("Free Click & Collect").click();
    const locationRadio = page
      .locator("label", { hasText: PICKUP_NAME })
      .first();
    await expect(locationRadio).toBeVisible({ timeout: 20_000 });
    await locationRadio.click();

    // …then flip BACK to Ship to Home before continuing — the address form
    // replaces the location list and the flow must charge shipping again.
    await page.getByText("Ship to Home").click();
    await fillShipToHomeStep(page);

    // Shipping Options step is BACK, with selectable rates.
    await expect(
      page.getByText("Shipping Options").first(),
      "Shipping Options did not reappear after switching back to Ship to Home",
    ).toBeVisible({ timeout: 30_000 });
    await fillShippingOptionsStep(page, /metro express/i);

    // A rate is charged again: the cart's SHIPPING component is non-zero.
    // (Comparing whole totals is a trap — a fresh no-address cart already
    // carries a default rate estimate, so assert the shipping line itself.)
    await expect
      .poll(
        async () => {
          const cart = await getStoreCart(api, cartToken);
          const totals = cart.totals as unknown as {
            total_shipping: string;
            total_shipping_tax: string;
          };
          return (
            Number(totals.total_shipping) + Number(totals.total_shipping_tax)
          );
        },
        {
          message:
            "no shipping charge after switching back to Ship to Home (rate lost)",
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0);
    await api.dispose();
  });
});
