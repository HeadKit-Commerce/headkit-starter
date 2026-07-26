import { test, expect, request } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE_URL,
  GATEWAY_URL,
  STORE_API,
  STORE_KEY,
  REGULAR_PRODUCT_ID,
  stackIsUp,
} from "./helpers";

/**
 * Real-key store: server-side cart add regression guard (sk/pk).
 *
 * THE BLIND SPOT this closes
 * --------------------------
 * The storefront ServerSDK (`@headkit/sdk` server entry) used to send the store
 * SECRET key (`HEADKIT_PRIVATE_KEY`) as the `x-headkit-key` header. But commerce
 * resolves stores by the PUBLIC key ONLY (packages/platform/store.go FindByKey →
 * `{publicKey: key}`, middleware.go → 401 "Public key not found"). So every
 * server-side cart/checkout call from a store whose secret key differs from its
 * public key 500'd. PR #79 fixed it: `x-headkit-key` is ALWAYS the public key,
 * and the secret moved to a separate `x-headkit-secret-key` header (which the
 * gateway does not even forward and commerce never reads).
 *
 * CI missed it because the E2E store left HEADKIT_PRIVATE_KEY equal to the public
 * key, so `resolveSecretKey()` collapsed to the public key and the ServerSDK sent
 * `pk` either way — the bug was masked. A REAL provisioned store gets a distinct
 * `sk_`, so it broke only in live UAT. scripts/e2e-ci-stack.sh now starts the
 * storefront-under-test with a DISTINCT `HEADKIT_PRIVATE_KEY` (`sk_e2e_local` ≠
 * `pk_e2e_local`), so the suite exercises the real secret path.
 *
 * The two guards below:
 *   1. REAL-KEY ADD (end-to-end): drive the running storefront's server-side
 *      add-to-cart (PDP button → addToCartAction → createServerHeadkit →
 *      ServerSDK) and prove it reached WooCommerce. With a distinct sk this FAILS
 *      against the pre-PR#79 SDK (sk sent as x-headkit-key → 401 → no line) and
 *      PASSES with the fix (pk sent → resolves).
 *   2. CONTRACT LOCK (gateway): prove directly that a store's SECRET key is NOT a
 *      valid store-resolution key — sending it as `x-headkit-key` (exactly what
 *      the pre-PR#79 ServerSDK did) fails, while the PUBLIC key succeeds. This
 *      captures the regression's mechanism independent of the app's SDK build.
 *
 * PREREQUISITES (self-skips when the stack is down):
 *   - local Docker stack (WP :8090, gateway :4000, commerce :8080, starter)
 *   - the storefront started with a DISTINCT HEADKIT_PRIVATE_KEY for guard #1 to
 *     be meaningful (scripts/e2e-ci-stack.sh does this; a stack where sk == pk
 *     still passes but no longer guards).
 *   - simple product `test-product-12` (id 678, $22) — storefront-parity seed.
 *
 * LOCAL-ONLY (HARD RULE): localhost Docker services only.
 */

const SIMPLE_SLUG = process.env.E2E_SIMPLE_PRODUCT_SLUG ?? "test-product-12";
const SIMPLE_NAME = "Test Product 12";
/**
 * The store's DISTINCT secret key. Emitted by `e2e-ci-stack.sh seed-env` as
 * E2E_STORE_SECRET_KEY; falls back to the deterministic local value the stack
 * script uses. Never a real/live key — LOCAL-ONLY, gates nothing.
 */
const SECRET_KEY = process.env.E2E_STORE_SECRET_KEY ?? "sk_e2e_local";

/** The cart drawer (Radix Sheet) — scope drawer assertions inside it. */
function drawer(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "Your Bag" });
}

test.describe("Real-key store: server-side cart add (sk/pk regression guard)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter (E2E_BASE_URL)",
    );
  });

  test("REAL-KEY ADD: PDP add-to-cart succeeds through the ServerSDK secret path", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    await page.goto(`${BASE_URL}/products/${SIMPLE_SLUG}`);
    await expect(
      page.getByRole("button", { name: /^add to cart$/i }),
      `PDP for ${SIMPLE_SLUG} did not render an Add to cart button`,
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^add to cart$/i }).click();

    // The drawer opens only when addToCartAction (server action → the SK-based
    // createServerHeadkit → ServerSDK) RESOLVES. Under the pre-PR#79 SDK, with a
    // distinct sk the server action 401s ("Public key not found"), returns
    // { success: false }, and the line never lands.
    await expect(
      drawer(page),
      "cart drawer did not open — the server-side add-to-cart failed (ServerSDK secret path likely sent sk as x-headkit-key → 401)",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      drawer(page).getByText(SIMPLE_NAME).first(),
      "added product name missing from the drawer after a real-key add",
    ).toBeVisible();

    // Authoritative proof the SERVER-SIDE mutation actually reached WooCommerce
    // through the gateway: the httpOnly `hk-cart-token` cookie is written by the
    // server action from the returned cart, and the Store API cart for that token
    // carries the line. A 401'd server action would set no cookie and add nothing.
    const cartToken =
      (await context.cookies()).find((c) => c.name === "hk-cart-token")
        ?.value ?? "";
    expect(
      cartToken,
      "no hk-cart-token cookie after add — the server-side add-to-cart did not succeed (ServerSDK secret path likely 401'd)",
    ).not.toBe("");

    const api = await request.newContext();
    const cart = (await (
      await api.get(`${STORE_API}/cart`, {
        headers: { "Cart-Token": cartToken },
      })
    ).json()) as { items_count?: number };
    await api.dispose();
    expect(
      Number(cart.items_count ?? 0),
      "WooCommerce cart is empty after the server-side add — the ServerSDK mutation did not reach the provider",
    ).toBeGreaterThan(0);
  });

  test("CONTRACT LOCK: the SECRET key is not a store-resolution key — sk as x-headkit-key fails, pk succeeds", async () => {
    const api = await request.newContext();
    try {
      const mutation =
        "mutation($input:AddToCartInput!){commerce{addToCart(input:$input){token itemsCount}}}";
      const variables = {
        input: { id: String(REGULAR_PRODUCT_ID), quantity: 1 },
      };

      // PUBLIC key as x-headkit-key → store resolves → add lands (this is what the
      // FIXED ServerSDK sends). No cart token → the backend mints a fresh cart.
      const okRes = await api.post(GATEWAY_URL, {
        headers: {
          "content-type": "application/json",
          "x-headkit-key": STORE_KEY,
        },
        data: { query: mutation, variables },
      });
      const okJson = (await okRes.json()) as {
        data?: { commerce?: { addToCart?: { itemsCount?: number } } };
        errors?: unknown[];
      };
      expect(
        okJson.errors,
        `add with the PUBLIC key (${STORE_KEY}) errored: ${JSON.stringify(okJson.errors)}`,
      ).toBeUndefined();
      expect(
        Number(okJson.data?.commerce?.addToCart?.itemsCount ?? 0),
        "add with the PUBLIC key did not land an item — is the store seeded (E2E_STORE_KEY) and the stack up?",
      ).toBeGreaterThan(0);

      // SECRET key as x-headkit-key → commerce FindByKey({publicKey: sk}) → 401.
      // This is EXACTLY the pre-PR#79 ServerSDK behaviour (resolveSecretKey →
      // x-headkit-key). It must NOT resolve a store, and must surface an error.
      const skRes = await api.post(GATEWAY_URL, {
        headers: {
          "content-type": "application/json",
          "x-headkit-key": SECRET_KEY,
        },
        data: { query: mutation, variables },
      });
      const skJson = (await skRes.json().catch(() => null)) as {
        data?: { commerce?: { addToCart?: { itemsCount?: number } } | null };
        errors?: unknown[];
      } | null;

      const addedWithSecret = Number(
        skJson?.data?.commerce?.addToCart?.itemsCount ?? 0,
      );
      expect(
        addedWithSecret,
        "the SECRET key resolved a store and added an item — a store must NEVER be resolvable by its secret key; sending sk as x-headkit-key is the exact pre-PR#79 bug PR #79 fixed",
      ).toBe(0);

      // The failure must be explicit (HTTP non-2xx or a GraphQL error), never a
      // silent empty success. commerce's message is "Public key not found"
      // (middleware.go); the gateway may wrap it, so we assert the failure shape,
      // not the exact wording, and surface the raw response for diagnosis.
      const failed = !skRes.ok() || Boolean(skJson?.errors?.length);
      expect(
        failed,
        `sending the secret key as x-headkit-key neither resolved a store nor produced an error (expected store-not-found). status=${skRes.status()} body=${JSON.stringify(skJson)}`,
      ).toBe(true);
    } finally {
      await api.dispose();
    }
  });
});
