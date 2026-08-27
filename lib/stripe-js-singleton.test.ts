import { afterEach, describe, expect, it, vi } from "vitest";

const loadStripeMock = vi.fn();

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: (...args: unknown[]) => loadStripeMock(...args),
}));

describe("getStripePromise", () => {
  afterEach(() => {
    vi.resetModules();
    loadStripeMock.mockReset();
  });

  it("returns the same promise for repeated calls with the same key and account", async () => {
    const resolved = Promise.resolve({} as never);
    loadStripeMock.mockReturnValue(resolved);

    const { getStripePromise } = await import("./stripe-js-singleton");

    const first = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_123",
    });
    const second = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_123",
    });

    expect(first).toBe(second);
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    expect(loadStripeMock).toHaveBeenCalledWith("pk_test_abc", {
      stripeAccount: "acct_123",
    });
  });

  it("creates separate promises for different Connect accounts", async () => {
    loadStripeMock
      .mockReturnValueOnce(Promise.resolve({ id: "a" } as never))
      .mockReturnValueOnce(Promise.resolve({ id: "b" } as never));

    const { getStripePromise } = await import("./stripe-js-singleton");

    const platform = getStripePromise("pk_test_abc");
    const connected = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_other",
    });

    expect(platform).not.toBe(connected);
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });
});
