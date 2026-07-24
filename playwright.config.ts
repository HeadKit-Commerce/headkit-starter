import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config for apps/starter — Wave 0 validation harness (Phase 3).
 *
 * LOCAL-ONLY (HARD RULE): every target is a localhost Docker endpoint.
 * No staging/prod host may appear in this file.
 *
 * Prerequisite: the local Docker stack must already be running before
 * `bun run test:e2e`:
 *   - WordPress + WooCommerce  http://localhost:8090
 *   - services/commerce (Go)   http://localhost:8080
 *   - Hive Gateway             http://localhost:4000/graphql
 *   - starter (Next)           http://localhost:3000   <- baseURL below
 *
 * We deliberately do NOT spawn the app via `webServer`: the storefront depends
 * on the full WP/Go/Hive stack, which Playwright cannot bring up. Bring the
 * stack up out-of-band (see scripts/smoke/boundary.sh and
 * e2e/fixtures/seed-customers.md), then run the e2e suite.
 */
export default defineConfig({
  testDir: "./e2e",
  // CI seam (E2E-01): comma-separated spec filenames to skip — used by the
  // ci.yml playwright job to exclude specs whose fixtures cannot be
  // provisioned in CI (paid plugins; checkout specs when no Stripe TEST key
  // secret is configured). Unset locally → the full suite runs.
  testIgnore: (process.env.E2E_TEST_IGNORE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((f) => `**/${f}`),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // LOCAL ONLY — the local Next starter served by the Docker stack.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
