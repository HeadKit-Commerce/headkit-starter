import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  TEST_USER,
  loginViaUi,
  stackIsUp,
  wpCliAvailable,
  wpEval,
  PRODUCT_ID,
} from "./fixtures/helpers-2";

/**
 * Refund visibility e2e (autonomous QA run — E2E-GAPS.md Gap 6).
 *
 * Closes UAT row P0-29 — the ENG-800 READ surface: a refunded order shows
 * status "refunded" in the logged-in /account/orders list AND on the order
 * detail page. (The Stripe→Woo refund SYNC itself is covered by ENG-800's
 * commerce-side work; this spec proves the storefront surfaces the result.)
 *
 * SEEDING (deterministic core): a WooCommerce order owned by the seeded
 * `hk-checkout-test` user is created with status `refunded` directly via
 * WP-CLI in the LOCAL Docker WordPress (additive only — reuses an existing
 * seeded refunded order when present, never deletes). The live path
 * (pay → Stripe TEST refund → webhook flips status) depends on the Gap-1
 * paid-checkout flow owned by the parallel top-5 workstream and stays a
 * manual/GAP-1-follow-up checkpoint (see E2E-GAPS.md Gap 6 case 4).
 *
 * PREREQUISITES:
 *   - local stack up (WP :8090, gateway :4000, starter — E2E_BASE_URL)
 *   - seeded auth user (docker/wordpress/seed-auth-user.php); run with
 *     HK_TEST_PASS if the stack's password differs from the seed default
 *   - Docker CLI access to the WP container (E2E_WP_CONTAINER, default
 *     docker-wordpress-1) for the order seed
 *   - NOTE: /account/orders is served by the commerce `orders` resolver →
 *     WooCommerce wc/v3; the store's Mongo consumerKey/secret must be valid
 *     in wp_woocommerce_api_keys or every list read 401s server-side and
 *     the page shows its generic error copy.
 *
 * LOCAL-ONLY (HARD RULE): all endpoints are localhost Docker services.
 */

/** Seed (or reuse) a refunded order owned by the seeded auth user. */
function seedRefundedOrder(): { id: number; key: string } {
  const out = wpEval(`
    $user = get_user_by("login", ${JSON.stringify(TEST_USER)});
    if (!$user) { echo json_encode(array("error" => "no seeded user")); return; }
    $uid = (int) $user->ID;
    $existing = wc_get_orders(array("customer_id" => $uid, "status" => array("wc-refunded"), "limit" => 1));
    if (!empty($existing)) {
      $o = $existing[0];
      echo json_encode(array("id" => $o->get_id(), "key" => $o->get_order_key()));
      return;
    }
    $order = wc_create_order(array("customer_id" => $uid));
    $product = wc_get_product(${PRODUCT_ID});
    if (!$product) { echo json_encode(array("error" => "no product ${PRODUCT_ID}")); return; }
    $order->add_product($product, 1);
    $order->set_billing_first_name("HK");
    $order->set_billing_last_name("Refund Test");
    $order->set_billing_email($user->user_email);
    $order->calculate_totals();
    $order->update_status("refunded", "E2E refund-visibility seed (autonomous QA run)");
    echo json_encode(array("id" => $order->get_id(), "key" => $order->get_order_key()));
  `);
  // wp-cli may emit PHP deprecation notices around the payload — parse the
  // last JSON object line only.
  const jsonLine =
    out
      .split("\n")
      .reverse()
      .find((l) => l.trim().startsWith("{")) ?? "{}";
  const parsed = JSON.parse(jsonLine) as {
    id?: number;
    key?: string;
    error?: string;
  };
  expect(
    parsed.error,
    `refunded-order seed failed: ${parsed.error}`,
  ).toBeUndefined();
  expect(parsed.id, "seed returned no order id").toBeTruthy();
  return { id: Number(parsed.id), key: String(parsed.key) };
}

test.describe("Refund visibility: refunded order status surfaces in the account area (P0-29 / ENG-800)", () => {
  let orderId = 0;
  let orderKey = "";

  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter",
    );
    test.skip(
      !wpCliAvailable(),
      "docker exec into the local WP container unavailable — cannot seed the refunded order",
    );
    const seeded = seedRefundedOrder();
    orderId = seeded.id;
    orderKey = seeded.key;
  });

  test("the /account/orders list shows the refunded order with status Refunded", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto(`${BASE_URL}/account/orders`);

    // The list must actually load (not the resolver-failure copy — that is
    // the wc/v3-credentials failure mode called out in the spec header).
    await expect(
      page.getByText(/couldn't load this right now/i),
      "orders list rendered its error state — commerce orders resolver failed (check WC REST credentials in Mongo vs wp_woocommerce_api_keys)",
    ).toHaveCount(0);

    const orderCard = page
      .locator(`a[href*="/account/orders/${orderId}"]`)
      .first();
    await expect(
      orderCard,
      `seeded refunded order #${orderId} is missing from the logged-in orders list`,
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      orderCard.getByText(/refunded/i),
      `order #${orderId} row does not display the refunded status`,
    ).toBeVisible();
  });

  test("the order detail page Status block shows refunded (list link click-through)", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto(`${BASE_URL}/account/orders`);
    const orderCard = page
      .locator(`a[href*="/account/orders/${orderId}"]`)
      .first();
    await expect(orderCard).toBeVisible({ timeout: 30_000 });
    await orderCard.click();
    await page.waitForURL(new RegExp(`/account/orders/${orderId}`), {
      timeout: 30_000,
    });

    await expect(
      page.getByRole("heading", { name: `Order #${orderId}` }),
      "order detail page did not render",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Status", { exact: true }),
      "detail Status block missing",
    ).toBeVisible();
    await expect(
      page.getByText(/refunded/i).first(),
      "detail page does not show the refunded status",
    ).toBeVisible();
  });

  test("direct deep-link with the order key renders the refunded detail (guest-order surface)", async ({
    page,
  }) => {
    // The detail page is key-gated (IDOR-safe): id + ?key= resolves without
    // relying on the list click-through — the same surface a confirmation
    // email links to.
    await loginViaUi(page);
    await page.goto(
      `${BASE_URL}/account/orders/${orderId}?key=${encodeURIComponent(orderKey)}`,
    );
    await expect(
      page.getByRole("heading", { name: `Order #${orderId}` }),
      "key-gated order detail did not resolve",
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/refunded/i).first()).toBeVisible();
  });
});
