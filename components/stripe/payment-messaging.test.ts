import { describe, expect, it } from "vitest";
import { shouldRenderMessaging } from "./payment-messaging";

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
