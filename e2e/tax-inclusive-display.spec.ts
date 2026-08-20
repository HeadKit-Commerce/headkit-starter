import { test, expect, request } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE_URL,
  TAXED_SLUG,
  money,
  seedTaxedCart,
  stackIsUp,
} from "./helpers";

/**
 * The tax-inclusive display guard — the half that needs no Stripe.
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * The WooCommerce Store API reports every TOTAL tax-EXCLUSIVE, with the tax in
 * a sibling `*_tax` field, and those totals are unaffected by the store's
 * "display prices including tax" setting (which does govern the per-item
 * `prices` object). A headless storefront that renders `line_subtotal` without
 * adding `line_subtotal_tax` therefore quotes every line UNDER the price its
 * own product page advertises.
 *
 * The starter did exactly that on five surfaces, from its first commit, for the
 * repo's entire history. Nothing caught it — not this suite, not the demo
 * storefront — for one reason: **every store the code ran against had zero
 * tax.** At 0%, `line_subtotal` and `line_subtotal + line_subtotal_tax` are the
 * same number, so the wrong read returns the right answer and no assertion can
 * distinguish them. It became visible only when a live customer switched on 10%
 * GST.
 *
 * So the guard is written against the MASK, not just the symptom. The fixture
 * (`docker/wordpress/seed-tax.php`) puts one product on its own 10% GST tax
 * class, and the first test below refuses to proceed unless that product's line
 * really does report a non-zero tax. Without that check every assertion here
 * would pass vacuously the moment the fixture regressed — which is precisely
 * how the original defect survived.
 *
 * WHY ONE TAXED PRODUCT AND NOT A TAXED STORE
 * -------------------------------------------
 * Switching the whole stack to GST would re-price every fixture: ~37 assertions
 * across the suite read raw Store API totals, and the checkout summary's
 * "Subtotal" and tax rows would both move. Scoping the rate to a tax class
 * reaches the same guard with zero blast radius on existing specs. See the
 * seed's header.
 *
 * WHAT IS ASSERTED HERE
 * ---------------------
 *   1. the fixture is genuinely taxed (the anti-vacuous check);
 *   2. the cart drawer line renders `line_subtotal + line_subtotal_tax`;
 *   3. the cart drawer footer renders `total_items + total_items_tax`;
 *   4. neither renders the bare ex-tax figure.
 *
 * The drawer is the highest-value assertion in the whole guard: it carries no
 * tax row to reconcile against, so a wrong read there is invisible to a shopper
 * doing arithmetic. Both tests reach it through the PDP and the Store API only,
 * so this file runs on EVERY CI run — including one with no Stripe secret.
 *
 * The checkout summary lives in `tax-inclusive-checkout.spec.ts`, split out
 * because loading `/checkout` needs a Stripe session; see that file's header.
 *
 * The expected numbers are never hard-coded — every one is computed from the
 * Store API response captured in the same run, so the spec asserts the
 * RELATIONSHIP (rendered == ex + tax) rather than a literal that would need
 * updating whenever the fixture price changes.
 *
 * The order confirmation and account order detail read the same
 * `lineDisplayTotal` helper through the same `LineItemDisplay` component; they
 * are covered at unit level (`lib/cart-prices.test.ts`,
 * `components/checkout/line-item-display.test.tsx`) because reaching them here
 * would require a placed order and therefore Stripe.
 *
 * PREREQUISITES (self-skips when the stack is down):
 *   - local Docker stack (WP :8090, gateway :4000, starter E2E_BASE_URL)
 *   - the taxed fixture from docker/wordpress/seed-tax.php
 *
 * LOCAL-ONLY (HARD RULE): localhost Docker services only.
 */

/** The cart drawer (Radix Sheet). */
function drawer(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "Your Bag" });
}

test.describe("Tax-inclusive display: the storefront never quotes an ex-tax line", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack is down (WP :8090 / gateway :4000 / starter) — bring it up with scripts/e2e-ci-stack.sh",
    );
  });

  test("the fixture is genuinely taxed — without this every assertion below is vacuous", async () => {
    const api = await request.newContext();
    const { line } = await seedTaxedCart(api);
    await api.dispose();

    // THE ANTI-VACUOUS CHECK. If this ever fails, the tax fixture has
    // regressed and the rest of this file is testing nothing — the exact
    // condition under which the original defect shipped and survived.
    expect(
      line.tax,
      `the taxed fixture reports ZERO tax, so ex-tax == inc-tax and this entire spec ` +
        `would pass against a storefront that drops the tax. Check that ` +
        `docker/wordpress/seed-tax.php ran and that woocommerce_calc_taxes is "yes".`,
    ).toBeGreaterThan(0);

    // And the two figures must be visibly different, not merely unequal by a
    // rounding artefact — a 1-cent gap would let a wrong read round into a
    // passing assertion.
    expect(
      line.incTax - line.exTax,
      "the taxed fixture's tax is too small to distinguish a correct read from a wrong one",
    ).toBeGreaterThan(0.5);
  });

  test("the cart drawer line and footer both include the tax", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // The expected figures come from the store, in this run — never a literal.
    const api = await request.newContext();
    const { line } = await seedTaxedCart(api);
    await api.dispose();

    // Driven through the REAL PDP add-to-cart button rather than by installing
    // a cart cookie. The drawer loads its cart client-side through the cart
    // context, and a cookie dropped into the browser before first paint is not
    // a path any shipped flow takes — `cart-ops.spec.ts` establishes this
    // click-through as the proven way to populate it.
    await page.goto(`${BASE_URL}/products/${TAXED_SLUG}`);
    const addToCart = page.getByRole("button", { name: /^add to cart$/i });
    await expect(
      addToCart,
      `the PDP for ${TAXED_SLUG} did not render an Add to cart button — is the tax fixture seeded and published?`,
    ).toBeVisible({ timeout: 30_000 });
    await addToCart.click();

    await expect(
      drawer(page),
      "cart drawer did not open after add-to-cart",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      drawer(page).getByText("Taxed Test Product").first(),
      "the taxed fixture's line never appeared in the cart drawer",
    ).toBeVisible({ timeout: 30_000 });

    const text = (await drawer(page).innerText()).replace(/\s+/g, " ");

    // The line total (`line_subtotal` + `line_subtotal_tax`).
    expect(
      text,
      `cart drawer must show the tax-INCLUSIVE line total ${money(line.incTax)}, ` +
        `not the Store API's ex-tax ${money(line.exTax)}`,
    ).toContain(money(line.incTax));

    // The footer total (`total_items` + `total_items_tax`). The same figure
    // here because the cart holds one line, asserted separately because the two
    // are computed from DIFFERENT Store API fields and regressed independently.
    expect(
      text,
      `cart drawer footer must show ${money(line.cartIncTax)}`,
    ).toContain(money(line.cartIncTax));

    // The negative half. The drawer carries no tax row of its own — its label
    // reads "Shipping calculated at checkout" — so the bare ex-tax figure has
    // no legitimate reason to appear anywhere in it. Without this, a render
    // that showed BOTH numbers would pass.
    expect(
      text,
      `cart drawer must NOT render the bare ex-tax figure ${money(line.exTax)} anywhere`,
    ).not.toContain(money(line.exTax));
  });
});
