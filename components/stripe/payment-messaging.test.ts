import { describe, expect, it, vi } from "vitest";

// `lib/stripe-js-singleton.ts` reads the store's advanced-fraud-signals
// setting from `@/lib/env`, and this subtree reaches it. Under vitest's `node`
// environment `createEnv()` takes the SERVER branch and parses the server
// schema, so importing it for real would demand a fully populated environment
// this spec has no interest in. Mocked to an empty object: every key the
// singleton reads is optional, and unset is the platform default.
vi.mock("@/lib/env", () => ({ env: {} }));

const { shouldRenderMessaging } = await import("./payment-messaging");

const base = {
  publishableKey: "pk_test_1",
  currency: "AUD",
  enabled: true,
  stripeAccountId: "acct_1",
};

describe("shouldRenderMessaging", () => {
  it("renders for a supported currency when enabled", () => {
    expect(shouldRenderMessaging(base)).toBe(true);
  });

  it("does not render when the store toggle is off", () => {
    expect(shouldRenderMessaging({ ...base, enabled: false })).toBe(false);
  });

  it("does not render without a publishable key", () => {
    expect(shouldRenderMessaging({ ...base, publishableKey: "" })).toBe(false);
  });

  it("does not render for an unsupported currency", () => {
    expect(shouldRenderMessaging({ ...base, currency: "THB" })).toBe(false);
  });

  it("accepts lower-case currency", () => {
    expect(shouldRenderMessaging({ ...base, currency: "aud" })).toBe(true);
  });

  it("does not render when explicitly disabled (out of stock)", () => {
    expect(shouldRenderMessaging({ ...base, disabled: true })).toBe(false);
  });

  it("does not render without a Connect account id", () => {
    expect(shouldRenderMessaging({ ...base, stripeAccountId: "" })).toBe(false);
    expect(shouldRenderMessaging({ ...base, stripeAccountId: undefined })).toBe(
      false,
    );
  });
});
