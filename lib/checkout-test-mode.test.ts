import { describe, expect, it, vi, afterEach } from "vitest";
import {
  copyTestCardNumber,
  formatTestCardNumber,
  isStripeTestCheckout,
  STRIPE_TEST_CARDS,
} from "./checkout-test-mode";

describe("isStripeTestCheckout", () => {
  it("shows for commerce testMode with a test publishable key", () => {
    expect(
      isStripeTestCheckout({
        testMode: true,
        publishableKey: "pk_test_abc",
      }),
    ).toBe(true);
  });

  it("shows for a test publishable key even when testMode is omitted", () => {
    expect(isStripeTestCheckout({ publishableKey: "pk_test_abc" })).toBe(true);
  });

  it("hides for a live publishable key even if testMode is leftover true", () => {
    expect(
      isStripeTestCheckout({
        testMode: true,
        publishableKey: "pk_live_abc",
      }),
    ).toBe(false);
  });

  it("hides when commerce says live and the key is live", () => {
    expect(
      isStripeTestCheckout({
        testMode: false,
        publishableKey: "pk_live_abc",
      }),
    ).toBe(false);
  });

  it("hides when both fields are empty (Shopify / no Stripe session)", () => {
    expect(isStripeTestCheckout({ testMode: false, publishableKey: "" })).toBe(
      false,
    );
    expect(isStripeTestCheckout({})).toBe(false);
  });
});

describe("formatTestCardNumber", () => {
  it("groups the succeed PAN into Stripe's spaced form", () => {
    expect(formatTestCardNumber("4242424242424242")).toBe(
      "4242 4242 4242 4242",
    );
  });

  it("strips existing punctuation before grouping", () => {
    expect(formatTestCardNumber("4242-4242-4242-4242")).toBe(
      "4242 4242 4242 4242",
    );
  });
});

describe("STRIPE_TEST_CARDS", () => {
  it("ships the three official cards testers reach for", () => {
    expect(STRIPE_TEST_CARDS.map((c) => c.number)).toEqual([
      "4242424242424242",
      "4000000000000002",
      "4000002760003184",
    ]);
  });
});

describe("copyTestCardNumber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the formatted PAN and returns true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTestCardNumber("4242 4242 4242 4242")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("4242 4242 4242 4242");
  });

  it("returns false when clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyTestCardNumber("4242")).resolves.toBe(false);
  });
});
