import { describe, expect, it, vi } from "vitest";

// `stripe-config.ts` imports `@/lib/env`, whose top-level `createEnv()` runs
// Zod validation at module load and throws when the required server env vars
// (NEXT_PUBLIC_HEADKIT_PUBLIC_KEY, NEXT_PUBLIC_GRAPHQL_URL, HEADKIT_PRIVATE_KEY)
// are unset in the test environment — matching the same trap documented for
// `app/seo-robots-sitemap.test.ts`. Only `DASHBOARD_API_URL`/`_TOKEN` matter
// to this module, so the mock covers just those two (both optional).
vi.mock("@/lib/env", () => ({
  env: { DASHBOARD_API_URL: undefined, DASHBOARD_API_TOKEN: undefined },
}));

import { coerceStripeConfig } from "./stripe-config";

describe("coerceStripeConfig", () => {
  it("selects the live key when the store is in live mode", () => {
    expect(
      coerceStripeConfig({
        publishableKeyTest: "pk_test_1",
        publishableKeyLive: "pk_live_1",
        accountId: "acct_1",
        mode: "LIVE",
        bnplMessagingEnabled: true,
      }),
    ).toEqual({
      publishableKey: "pk_live_1",
      accountId: "acct_1",
      bnplMessagingEnabled: true,
    });
  });

  it("selects the test key in test mode even when a live key is present", () => {
    expect(
      coerceStripeConfig({
        publishableKeyTest: "pk_test_1",
        publishableKeyLive: "pk_live_1",
        accountId: "acct_1",
        mode: "TEST",
        bnplMessagingEnabled: true,
      }).publishableKey,
    ).toBe("pk_test_1");
  });

  it("falls back to the test key when live mode has no live key", () => {
    expect(
      coerceStripeConfig({
        publishableKeyTest: "pk_test_1",
        publishableKeyLive: null,
        accountId: "acct_1",
        mode: "LIVE",
        bnplMessagingEnabled: true,
      }).publishableKey,
    ).toBe("pk_test_1");
  });

  it("defaults messaging OFF when the field is absent (older dashboard-api)", () => {
    expect(
      coerceStripeConfig({
        publishableKeyTest: "pk_test_1",
        accountId: "acct_1",
      }).bnplMessagingEnabled,
    ).toBe(false);
  });

  it("defaults to TEST when mode is absent (older dashboard-api)", () => {
    expect(
      coerceStripeConfig({
        publishableKeyTest: "pk_test_1",
        publishableKeyLive: "pk_live_1",
        accountId: "acct_1",
      }).publishableKey,
    ).toBe("pk_test_1");
  });

  it("returns a disabled config for a null payload", () => {
    expect(coerceStripeConfig(null)).toEqual({
      publishableKey: "",
      accountId: "",
      bnplMessagingEnabled: false,
    });
  });
});
