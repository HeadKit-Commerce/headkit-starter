import { expect, request, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

/**
 * Shared helpers for the autonomous-QA e2e suite (gaps #6–#11 of
 * .planning/quick/260718-autonomous-qa-run/E2E-GAPS.md).
 *
 * NEW file on purpose: the pre-existing fixture files and specs are owned by
 * other workstreams and must not be edited (merge-conflict avoidance). Helpers
 * here mirror the conventions of checkout-auth.spec.ts / gift-card.spec.ts.
 *
 * LOCAL-ONLY (HARD RULE): every endpoint is a localhost Docker service.
 * No staging/prod host may appear here.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const WP_BASE_URL = process.env.WP_BASE_URL ?? "http://localhost:8090";
export const GATEWAY_URL =
  process.env.E2E_GATEWAY_URL ?? "http://localhost:4000/graphql";
export const STORE_KEY = process.env.E2E_STORE_KEY ?? "pk_local";
export const STORE_API = `${WP_BASE_URL}/wp-json/wc/store/v1`;

// Seeded auth fixture (docker/wordpress/seed-auth-user.php). Password is
// env-overridable — the committed seed default differs from some running
// stacks (see checkout-auth.spec.ts header): HK_TEST_PASS='Eng792Test!pass'.
export const TEST_EMAIL =
  process.env.HK_TEST_EMAIL ?? "hk-checkout-test@example.com";
export const TEST_USER = process.env.HK_TEST_USER ?? "hk-checkout-test";
export const TEST_PASS = process.env.HK_TEST_PASS ?? "HkCheckout!2026";

/** Simple purchasable product in the local seed (Test Product 12, $22). */
export const PRODUCT_ID = Number(process.env.E2E_CHECKOUT_PRODUCT_ID ?? "678");

/** Variable product with pa_color + pa_size in the local seed. */
export const VARIABLE_PRODUCT_SLUG =
  process.env.E2E_VARIABLE_PRODUCT_SLUG ?? "classic-tee";

/**
 * Health-probe the local stack (WP Store API + starter + gateway). Used for
 * describe-level self-skip so a cold machine's unit run stays green (the
 * gift-card.spec pattern). Never throws.
 */
export async function stackIsUp(): Promise<boolean> {
  try {
    const api = await request.newContext();
    const wp = await api.get(`${STORE_API}/cart`).catch(() => null);
    const app = await api.get(BASE_URL).catch(() => null);
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
    return Boolean(wp?.ok() && app?.ok() && gw);
  } catch {
    return false;
  }
}

/**
 * Log in through the REAL storefront sign-in form (/account). On success the
 * app sets the `hk-auth-token` cookie and routes to /account/profile.
 * Mirrors checkout-auth.spec.ts (helper duplicated here rather than editing
 * that spec — see file header). The JWT is never printed.
 */
export async function loginViaUi(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/account`);
  await page.getByLabel("Email").first().fill(TEST_EMAIL);
  await page.getByLabel("Password").first().fill(TEST_PASS);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/account\/profile/, { timeout: 30_000 });
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === "hk-auth-token");
  expect(
    authCookie?.value?.length ?? 0,
    "login did not set the hk-auth-token cookie — sign-in failed (check seeded creds / HK_TEST_PASS)",
  ).toBeGreaterThan(0);
}

/**
 * CORS shim for non-default starter ports.
 *
 * The LOCAL Hive gateway pins `access-control-allow-origin` to
 * http://localhost:3000 (its CORS_ALLOWED_ORIGINS), so a starter served on
 * any other port (parallel-worktree runs use :3003 etc.) has every
 * CLIENT-side SDK fetch blocked by the browser. This route handler keeps the
 * requests REAL — Playwright forwards them to the actual gateway and returns
 * the actual response — and only injects the CORS response headers the
 * gateway would emit for an allowed origin. No-op in effect when the app is
 * on :3000. Test-harness concern only, NOT an app workaround: per-store CORS
 * origins are env config on the gateway.
 */
export async function allowGatewayCors(page: Page): Promise<void> {
  const gwOrigin = new URL(GATEWAY_URL).origin;
  const appOrigin = new URL(BASE_URL).origin;
  const corsHeaders = {
    "access-control-allow-origin": appOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      "Content-Type, Authorization, x-headkit-key, x-cart-token, x-klaviyo-id",
    "access-control-allow-credentials": "true",
  };
  await page.route(`${gwOrigin}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      headers: { ...res.headers(), ...corsHeaders },
    });
  });
}

/** Docker container running the local WordPress (docker/README.md stack). */
const WP_CONTAINER = process.env.E2E_WP_CONTAINER ?? "docker-wordpress-1";

/**
 * Run a PHP snippet inside the LOCAL WordPress container via `wp eval`.
 * Used for seed/assert steps that have no REST surface in the local stack
 * (e.g. Gravity Forms entries, WC order seeding). Throws on failure.
 *
 * HARD GUARD: refuses to run unless WP_BASE_URL is a localhost address —
 * this helper must never touch a remote WordPress.
 */
export function wpEval(phpCode: string): string {
  if (!/localhost|127\.0\.0\.1/.test(WP_BASE_URL)) {
    throw new Error(
      `wpEval refused: WP_BASE_URL=${WP_BASE_URL} is not a local address (LOCAL-ONLY hard rule)`,
    );
  }
  return execFileSync(
    "docker",
    [
      "exec",
      WP_CONTAINER,
      "wp",
      "--allow-root",
      "--path=/var/www/html",
      "eval",
      phpCode,
    ],
    { encoding: "utf8", timeout: 60_000 },
  ).trim();
}

/**
 * True when `docker exec <wp-container> wp` works from this host — the
 * prerequisite for wpEval-based seeding. Lets specs self-skip on machines
 * where the Docker CLI/container is unavailable rather than erroring.
 */
export function wpCliAvailable(): boolean {
  try {
    wpEval('echo "ok";');
    return true;
  } catch {
    return false;
  }
}
