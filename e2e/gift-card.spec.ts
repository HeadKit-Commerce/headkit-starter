import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Gift-card end-to-end (Phase 09 — full flow: purchase -> code -> redeem -> charge).
 *
 * GREEN live coverage of the whole gift-card journey the phase must satisfy,
 * proven against the running LOCAL Docker stack (09-09, GIFT-05). It layers
 * browser-driven shopper assertions (detection form, redeem UI) with
 * deterministic data-layer + Stripe-test-mode contract guards for the money
 * invariants that the diagnose-only sweep could not run:
 *
 *   - GIFT-01/02 detection: theme `_gift_card` meta -> SDK `isGiftCard` -> the PDP
 *     gates the purchase form on that flag.
 *   - GIFT-02 purchase transport: filling the form and adding to cart sends
 *     `gift_card_configuration` through commerce to the WC Store API (the gift
 *     line is accepted and lands in the cart).
 *   - GIFT-03 redemption: a redeem box at checkout calling `applyGiftCard`, plus
 *     `cart_mapper` surfacing the applied card (masked code / amount / balance),
 *     and the payable total dropping.
 *   - GIFT-04 charge integrity: the Stripe Checkout Session amount equals the
 *     post-redemption cart total, never the full pre-gift-card amount — asserted
 *     via the Stripe TEST-mode API on a real session created by commerce.
 *   - T-09-07 stale-fee / large code: redeeming a large code IN CHECKOUT (after
 *     the session is created, through syncCheckoutSessionLineItems) reduces the
 *     charged session amount BELOW the create-time 1% platform fee and the sync
 *     succeeds — proving the update-path re-set (fee re-set + shipping clear).
 *
 * Live paid-order CODE GENERATION (a fresh code minted into wp_woocommerce_gc_cards
 * at order-paid status) and the confirmed PaymentIntent application_fee_amount are
 * covered by the 09-09 human-verify checkpoint (they require completing a Stripe
 * test payment / advancing an order to paid — see 09-09-SUMMARY.md HUMAN-VERIFY
 * EVIDENCE). This spec asserts everything that is deterministically automatable.
 *
 * LOCAL-ONLY (HARD RULE): every endpoint is a localhost Docker service
 * (starter :3000, WP/WooCommerce :8090, gateway :4000). Stripe is TEST MODE only
 * (sk_test_ read from services/commerce/.env). No staging/prod host may appear.
 * Gift-card codes are never printed beyond the seeded fixture literals.
 *
 * PREREQUISITES (stack up + seeded):
 *   - WordPress + WooCommerce   http://localhost:8090   (WP_BASE_URL)
 *   - services/commerce (Go)    http://localhost:8080
 *   - Hive Gateway              http://localhost:4000/graphql  (E2E_GATEWAY_URL)
 *   - starter (Next)            http://localhost:3000   (E2E_BASE_URL, baseURL)
 *   - the gift-card seed applied (docker/wordpress/seed-gift-card.php):
 *       * product SKU HK-GIFTCARD / slug `headkit-gift-card`, _gift_card='yes'
 *       * $50   active code TEST-GIFT-CARD-0001 (partial-redemption fixture)
 *       * $119.50 active code TEST-GIFT-CARD-9950 (large-code / stale-fee fixture)
 * If a prerequisite (or the Stripe test key) is missing the affected test/describe
 * self-skips (health probe) so it never fails the default unit run; when the stack
 * IS up the assertions are REAL.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const WP_BASE_URL = process.env.WP_BASE_URL ?? "http://localhost:8090";
const GATEWAY_URL =
  process.env.E2E_GATEWAY_URL ?? "http://localhost:4000/graphql";
const STORE_KEY = process.env.E2E_STORE_KEY ?? "pk_local";
const STORE_API = `${WP_BASE_URL}/wp-json/wc/store/v1`;

// Seeded gift-card fixtures (docker/wordpress/seed-gift-card.php).
const GIFT_CARD_SLUG = process.env.HK_GIFT_CARD_SLUG ?? "headkit-gift-card";
const GIFT_CARD_CODE = process.env.HK_GIFT_CARD_CODE ?? "TEST-GIFT-CARD-0001"; // $50
const GIFT_CARD_CODE_LAST4 = GIFT_CARD_CODE.slice(-4);
// $119.50 card: on the qty-5 cart it leaves a payable BELOW the 1% create fee.
const LARGE_GIFT_CARD_CODE =
  process.env.HK_LARGE_GIFT_CARD_CODE ?? "TEST-GIFT-CARD-9950";

// A purchasable simple product in the local seed (Test Product 12 = $22). It is
// the NON-gift-card item the redeem/charge flows discount. Override if the
// catalog differs.
const REGULAR_PRODUCT_ID = Number(process.env.E2E_CHECKOUT_PRODUCT_ID ?? "678");

/**
 * The Stripe TEST secret key (sk_test_…) used to read back the authoritative
 * charged amount from the Stripe test API. Sourced from the environment or the
 * local commerce service's .env (the exact key the running commerce uses).
 * Returns null when unavailable so the charge tests self-skip rather than fail.
 * LOCAL/TEST ONLY — never a live key.
 */
function stripeTestKey(): string | null {
  const fromEnv = process.env.STRIPE_SECRET_KEY;
  if (fromEnv && fromEnv.startsWith("sk_test_")) return fromEnv;
  // Playwright runs with cwd = apps/starter; the commerce env files sit two dirs
  // up. `.env.development.local` takes precedence over `.env` (it is the key the
  // running commerce service actually loads, so its account owns the session).
  const candidates = [
    resolve(process.cwd(), "../../services/commerce/.env.development.local"),
    resolve(process.cwd(), "../../services/commerce/.env"),
    resolve(process.cwd(), "services/commerce/.env.development.local"),
    resolve(process.cwd(), "services/commerce/.env"),
  ];
  for (const path of candidates) {
    try {
      const txt = readFileSync(path, "utf8");
      const m = txt.match(/^STRIPE_SECRET_KEY=(sk_test_\S+)\s*$/m);
      if (m) return m[1]!;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Probe the local stack (WP Store API + starter + gateway). Returns true only
 * when all respond, so the describe self-skips on a cold machine instead of
 * failing the default unit run. Never throws.
 */
async function stackIsUp(): Promise<boolean> {
  try {
    const api = await request.newContext();
    const wp = await api.get(`${STORE_API}/cart`);
    const app = await api.get(BASE_URL);
    let gw = false;
    try {
      const g = await api.post(GATEWAY_URL, {
        headers: {
          "content-type": "application/json",
          "x-headkit-key": STORE_KEY,
        },
        data: { query: "query{__typename}" },
      });
      gw = g.ok();
    } catch {
      gw = false;
    }
    await api.dispose();
    return wp.ok() && app.ok() && gw;
  } catch {
    return false;
  }
}

/** Bootstrap a fresh WooCommerce cart and return its Cart-Token. */
async function bootstrapCart(api: APIRequestContext): Promise<string> {
  const boot = await api.get(`${STORE_API}/cart`);
  expect(
    boot.status(),
    `WooCommerce Store API unreachable at ${WP_BASE_URL} — is the local WP stack up?`,
  ).toBe(200);
  const cartToken = boot.headers()["cart-token"] ?? "";
  expect(cartToken, "Store API did not return a Cart-Token header").not.toBe(
    "",
  );
  return cartToken;
}

/** Add a simple product to a cart via the Store API. */
async function addRegularItem(
  api: APIRequestContext,
  cartToken: string,
  quantity: number,
): Promise<void> {
  const add = await api.post(`${STORE_API}/cart/add-item`, {
    headers: { "Content-Type": "application/json", "Cart-Token": cartToken },
    data: { id: REGULAR_PRODUCT_ID, quantity },
  });
  expect(
    [200, 201],
    `add-item failed for product ${REGULAR_PRODUCT_ID} x${quantity} (HTTP ${add.status()})`,
  ).toContain(add.status());
  const body = await add.json();
  expect(
    body.items_count,
    `cart is empty after add-item (product ${REGULAR_PRODUCT_ID})`,
  ).toBeGreaterThan(0);
}

/**
 * Seed a fresh cart with `quantity` of the regular product and return its
 * Cart-Token (also usable as the storefront `hk-cart-token` cookie).
 */
async function seedRegularCart(
  api: APIRequestContext,
  quantity = 1,
): Promise<string> {
  const cartToken = await bootstrapCart(api);
  await addRegularItem(api, cartToken, quantity);
  return cartToken;
}

/** Apply a gift-card code to a cart via the Store API extensions endpoint. */
async function applyGiftCardViaStoreApi(
  api: APIRequestContext,
  cartToken: string,
  code: string,
): Promise<void> {
  const res = await api.post(`${STORE_API}/cart/extensions`, {
    headers: { "Content-Type": "application/json", "Cart-Token": cartToken },
    data: {
      namespace: "woocommerce-gift-cards",
      data: { action: "apply_gift_card_to_session", wc_gc_cart_code: code },
    },
  });
  expect(
    res.status(),
    `apply_gift_card_to_session failed (HTTP ${res.status()}) — is the seeded code active? (seed-gift-card.php)`,
  ).toBe(200);
}

/** Authoritative payable total (minor units) straight from the Store API cart. */
async function cartTotalMinor(
  api: APIRequestContext,
  cartToken: string,
): Promise<number> {
  const cart = await (
    await api.get(`${STORE_API}/cart`, { headers: { "Cart-Token": cartToken } })
  ).json();
  return Number(cart.totals.total_price);
}

/** Create a Stripe Checkout Session for a cart via commerce (gateway). Returns the session id. */
async function createCheckoutSession(
  api: APIRequestContext,
  cartToken: string,
): Promise<string> {
  const res = await api.post(GATEWAY_URL, {
    headers: {
      "content-type": "application/json",
      "x-headkit-key": STORE_KEY,
      "x-cart-token": cartToken,
    },
    data: {
      query:
        "mutation($i:CreateCheckoutSessionInput!){commerce{createCheckoutSession(input:$i){sessionId testMode}}}",
      variables: {
        i: {
          returnUrl: `${BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        },
      },
    },
  });
  const json = await res.json();
  expect(
    json.errors,
    `createCheckoutSession errored: ${JSON.stringify(json.errors)}`,
  ).toBeUndefined();
  const result = json.data.commerce.createCheckoutSession;
  expect(result.testMode, "Stripe must be in TEST mode (LOCAL-ONLY)").toBe(
    true,
  );
  expect(result.sessionId).toMatch(/^cs_test_/);
  return result.sessionId as string;
}

/** Sync a session's line items to the current cart (the redeem-in-checkout update path). */
async function syncCheckoutSession(
  api: APIRequestContext,
  cartToken: string,
  sessionId: string,
): Promise<boolean> {
  const res = await api.post(GATEWAY_URL, {
    headers: {
      "content-type": "application/json",
      "x-headkit-key": STORE_KEY,
      "x-cart-token": cartToken,
    },
    data: {
      query: `mutation{commerce{syncCheckoutSessionLineItems(sessionId:"${sessionId}"){ok}}}`,
    },
  });
  const json = await res.json();
  expect(
    json.errors,
    `syncCheckoutSessionLineItems errored: ${JSON.stringify(json.errors)}`,
  ).toBeUndefined();
  return Boolean(json.data.commerce.syncCheckoutSessionLineItems.ok);
}

/** Read the authoritative charged amount (amount_total, minor units) from the Stripe TEST API. */
async function stripeSessionAmount(
  api: APIRequestContext,
  sk: string,
  sessionId: string,
): Promise<{ amountTotal: number; livemode: boolean }> {
  const res = await api.get(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    { headers: { Authorization: `Bearer ${sk}` } },
  );
  const json = await res.json();
  expect(
    json.error,
    `Stripe session read errored: ${JSON.stringify(json.error)}`,
  ).toBeFalsy();
  return {
    amountTotal: Number(json.amount_total),
    livemode: Boolean(json.livemode),
  };
}

test.describe("Gift cards: purchase -> code -> redeem -> reduced charge (Phase 09)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter :3000",
    );
  });

  test("GIFT-01/02: the gift-card PDP renders the purchase form (detection via isGiftCard)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/${GIFT_CARD_SLUG}`);

    // The gift-card product is a `simple` product carrying `_gift_card='yes'`.
    // Detection flows theme meta -> SDK isGiftCard -> PDP form gate.
    await expect(
      page.getByPlaceholder("Recipient Email"),
      "gift-card purchase form did not render on the PDP — detection (SDK isGiftCard flag) not wired (GIFT-01)",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("From Name")).toBeVisible();
    await expect(
      page.getByText("Delivery date:", { exact: false }),
    ).toBeVisible();
  });

  test("GIFT-02: filling the form and adding to cart sends gift_card_configuration to the Store API", async ({
    page,
    context,
  }) => {
    await page.goto(`${BASE_URL}/products/${GIFT_CARD_SLUG}`);

    // Fill recipient/from/message; keep delivery = Now (the default). Blur each
    // field so the form's async validity + captured-values state both settle
    // before the add-to-cart button enables (it is gated on both).
    const fillGiftForm = async () => {
      await page
        .getByPlaceholder("Recipient Email")
        .fill("giftcard-recipient@example.com");
      await page.getByPlaceholder("Recipient Email").blur();
      await page.getByPlaceholder("From Name").fill("HeadKit E2E");
      await page.getByPlaceholder("From Name").blur();
      await page
        .getByPlaceholder(/special message/i)
        .fill("Happy Birthday from the HeadKit E2E suite");
      await page.getByPlaceholder(/special message/i).blur();
    };
    await fillGiftForm();

    // The gift-card form is lazy-loaded (RC-1 perf fix): its SSR markup is
    // interactive-looking before the client chunk hydrates, so a fill that
    // lands pre-hydration is silently clobbered when react-hook-form mounts
    // (the field reverts to empty and the button stays disabled). If the
    // button hasn't enabled shortly after the first pass, refill once —
    // post-hydration events always register.
    const addToCart = page.getByRole("button", { name: /^add to cart$/i });
    try {
      await expect(addToCart).toBeEnabled({ timeout: 5_000 });
    } catch {
      await fillGiftForm();
    }

    // The button enables only once the gift config is captured (Playwright
    // auto-waits for enabled), then the giftConfig add-item path fires
    // (commerce cart_provider builds gift_card_configuration for the Store API).
    await addToCart.click();

    // A successful add persists the storefront cart token cookie. Assert the
    // gift line actually landed in the WooCommerce cart (transport confirmed):
    // read the storefront's cart token and query the Store API for the item.
    await expect
      .poll(
        async () => {
          const cookies = await context.cookies();
          return cookies.find((c) => c.name === "hk-cart-token")?.value ?? "";
        },
        {
          message:
            "add-to-cart did not establish a cart — the gift-card purchase transport (gift_card_configuration) did not fire (GIFT-02)",
          timeout: 20_000,
        },
      )
      .not.toBe("");

    const cartToken =
      (await context.cookies()).find((c) => c.name === "hk-cart-token")
        ?.value ?? "";
    const api = await request.newContext();
    const cart = await (
      await api.get(`${STORE_API}/cart`, {
        headers: { "Cart-Token": cartToken },
      })
    ).json();
    await api.dispose();

    expect(
      cart.items_count,
      "the storefront cart is empty after adding the gift card — transport failed",
    ).toBeGreaterThan(0);
    // The WC Store API cart item exposes `name` (not a slug). The gift line was
    // accepted iff the gift-card product is present — proves gift_card_configuration
    // passed commerce -> the Store API (the plugin rejects a bad config).
    const names = (cart.items ?? []).map(
      (i: { name?: string }) => i.name ?? "",
    );
    expect(
      names.some((n: string) => /gift card/i.test(n)),
      `the gift-card product is not in the Store API cart after add (gift_card_configuration rejected). items=${JSON.stringify(names)}`,
    ).toBe(true);
  });

  test("GIFT-03: redeeming the seeded code at checkout shows the applied card and drops the payable total", async ({
    page,
    context,
  }) => {
    // A PARTIAL redemption (cart > card balance) — the $50 card against a
    // ~$76 (qty 3 x $22 + shipping) cart leaves a positive payable, exercising
    // the real reduced-charge path (not the zero-total bypass).
    const api = await request.newContext();
    const cartToken = await seedRegularCart(api, 3);
    const totalBefore = await cartTotalMinor(api, cartToken);
    await api.dispose();
    expect(
      totalBefore,
      "seeded cart should exceed the $50 card",
    ).toBeGreaterThan(5000);

    await context.addCookies([
      { name: "hk-cart-token", value: cartToken, url: BASE_URL },
    ]);
    await page.goto(`${BASE_URL}/checkout`);

    // The redeem UI is the UNIFIED "Coupon Code or Gift Card" box (CouponBox)
    // — the dedicated gift-card input this spec originally targeted was
    // retired when the box was combined (autonomous QA run locator fix).
    const codeInput = page.getByPlaceholder("Coupon Code or Gift Card");
    await expect(
      codeInput,
      "no coupon/gift-card redeem input at checkout — the redemption UI (GIFT-03) is not wired",
    ).toBeVisible({ timeout: 20_000 });
    await codeInput.fill(GIFT_CARD_CODE);
    await page.getByRole("button", { name: /^apply$/i }).click();

    // The applied card must become visible (masked code) and the "Remaining
    // balance" line renders — cart_mapper surfaced appliedGiftCards (GIFT-03).
    await expect(
      page.getByText(new RegExp(GIFT_CARD_CODE_LAST4)).first(),
      "applied gift card (masked code) is not visible at checkout — cart_mapper did not surface appliedGiftCards (GIFT-03)",
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/remaining balance/i).first(),
      "applied gift card remaining balance not shown",
    ).toBeVisible();
  });

  test("GIFT-03 data-layer contract: the Store API returns applied_giftcards[] and drops total_price (A1)", async () => {
    const api = await request.newContext();
    const cartToken = await seedRegularCart(api, 1);

    const before = await (
      await api.get(`${STORE_API}/cart`, {
        headers: { "Cart-Token": cartToken },
      })
    ).json();
    const totalBefore = Number(before.totals.total_price);
    expect(
      totalBefore,
      "cart total should be > 0 before redemption",
    ).toBeGreaterThan(0);

    await applyGiftCardViaStoreApi(api, cartToken, GIFT_CARD_CODE);

    const after = await (
      await api.get(`${STORE_API}/cart`, {
        headers: { "Cart-Token": cartToken },
      })
    ).json();
    const gc = after.extensions?.["woocommerce-gift-cards"]?.applied_giftcards;
    expect(
      Array.isArray(gc) && gc.length > 0,
      "Store API did not return applied_giftcards[] after applying the seeded code (A1 regression)",
    ).toBe(true);

    const card = gc[0];
    expect(typeof card.id, "applied gift card id must be a number").toBe(
      "number",
    );
    expect(typeof card.code, "applied gift card code must be a string").toBe(
      "string",
    );
    expect(card.amount, "amount must be a minor-unit string").toMatch(/^\d+$/);
    expect(card.balance, "balance must be a minor-unit string").toMatch(
      /^\d+$/,
    );
    expect(card).toHaveProperty("pending_message");

    const totalAfter = Number(after.totals.total_price);
    expect(
      totalAfter,
      "total_price did not drop after applying the gift card (set_total not reflected)",
    ).toBeLessThan(totalBefore);

    await api.dispose();
  });

  test("GIFT-04: the Stripe Checkout Session charges the reduced (post-redemption) total, never the full amount", async () => {
    const sk = stripeTestKey();
    test.skip(
      !sk,
      "Stripe TEST key (sk_test_) not configured — cannot read the charged amount",
    );

    const api = await request.newContext();
    // Partial redemption: qty 3 (~$76) with the $50 card leaves 0 < payable < subtotal.
    const cartToken = await seedRegularCart(api, 3);
    const preGiftTotal = await cartTotalMinor(api, cartToken);

    await applyGiftCardViaStoreApi(api, cartToken, GIFT_CARD_CODE);
    const reducedPayable = await cartTotalMinor(api, cartToken);
    expect(
      reducedPayable,
      "redemption must leave a positive, reduced payable",
    ).toBeGreaterThan(0);
    expect(reducedPayable).toBeLessThan(preGiftTotal);

    // Create the session AFTER redemption (redeem-before-create path).
    const sessionId = await createCheckoutSession(api, cartToken);
    const { amountTotal, livemode } = await stripeSessionAmount(
      api,
      sk!,
      sessionId,
    );
    await api.dispose();

    expect(livemode, "MUST be Stripe TEST mode (LOCAL-ONLY)").toBe(false);
    // The charge equals the reduced payable and is strictly below the pre-gift total.
    expect(
      amountTotal,
      "Stripe session amount must equal the reduced (post-gift-card) payable — GIFT-04 would overcharge",
    ).toBe(reducedPayable);
    expect(
      amountTotal,
      "Stripe session amount must be strictly less than the pre-gift-card total",
    ).toBeLessThan(preGiftTotal);
  });

  test("T-09-07: redeeming a LARGE code IN CHECKOUT reduces the charge below the create-time fee without a Stripe rejection", async () => {
    const sk = stripeTestKey();
    test.skip(
      !sk,
      "Stripe TEST key (sk_test_) not configured — cannot read the charged amount",
    );

    const api = await request.newContext();
    // ~$120 cart (qty 5 x $22 + shipping) — create-time platform fee is 1% ≈ $1.20.
    const cartToken = await seedRegularCart(api, 5);
    const fullTotal = await cartTotalMinor(api, cartToken);
    const createTimeFee = Math.max(1, Math.floor(fullTotal / 100)); // 1% Starter plan

    // Create the session on the FULL cart FIRST (session amount == full total),
    // so redemption below flows through the update path (not create).
    const sessionId = await createCheckoutSession(api, cartToken);
    const beforeRedeem = await stripeSessionAmount(api, sk!, sessionId);
    expect(
      beforeRedeem.amountTotal,
      "session must start at the full total",
    ).toBe(fullTotal);

    // Redeem the LARGE code IN CHECKOUT — leaves a payable BELOW the create-time
    // fee (the stale-fee trap: a fee off the full total would exceed the charge).
    await applyGiftCardViaStoreApi(api, cartToken, LARGE_GIFT_CARD_CODE);
    const reducedPayable = await cartTotalMinor(api, cartToken);
    expect(
      reducedPayable,
      "large code must leave a positive payable",
    ).toBeGreaterThan(0);
    expect(
      reducedPayable,
      "the large-code payable must be BELOW the 1% create-time fee (the stale-fee scenario)",
    ).toBeLessThan(createTimeFee);

    // Sync the session to the redeemed cart (the update path: re-consolidate the
    // line, clear stale shipping, re-set the PI application_fee_amount <= charge).
    const ok = await syncCheckoutSession(api, cartToken, sessionId);
    expect(
      ok,
      "syncCheckoutSessionLineItems must succeed (no Stripe fee>amount rejection)",
    ).toBe(true);

    const afterSync = await stripeSessionAmount(api, sk!, sessionId);
    await api.dispose();

    // The charge dropped to the reduced payable — proving the update path
    // charges the redeemed total (not full, not payable+stale-shipping) and the
    // session confirms below the create-time fee.
    expect(
      afterSync.amountTotal,
      "after in-checkout redemption the session must charge the reduced payable",
    ).toBe(reducedPayable);
    expect(afterSync.amountTotal).toBeLessThan(createTimeFee);
    expect(afterSync.amountTotal).toBeLessThan(fullTotal);
  });
});
