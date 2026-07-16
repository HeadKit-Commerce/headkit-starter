import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ENG-784 D7 — isCheckoutSessionDead: dead-session detection is a SERVER
 * retrieve checking `status !== "open"`, never Stripe error-string sniffing.
 * A failed retrieve must report "alive" (false) so callers keep their inline
 * error handling instead of tearing down a possibly-payable session.
 */

const createServerHeadkitMock = vi.fn();

vi.mock("@/lib/sdk.server", () => ({
  createServerHeadkit: (...args: unknown[]) => createServerHeadkitMock(...args),
}));

function sdkWithStatus(status: string): {
  payments: { getCheckoutSession: ReturnType<typeof vi.fn> };
} {
  return {
    payments: {
      getCheckoutSession: vi.fn().mockResolvedValue({ status }),
    },
  };
}

let isCheckoutSessionDead: typeof import("./checkout-session-status").isCheckoutSessionDead;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("./checkout-session-status");
  isCheckoutSessionDead = mod.isCheckoutSessionDead;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isCheckoutSessionDead (ENG-784, D7)", () => {
  it("alive when the server reports status open", async () => {
    createServerHeadkitMock.mockReturnValue(sdkWithStatus("open"));

    await expect(isCheckoutSessionDead("cs_1")).resolves.toBe(false);
  });

  it("dead when the server reports status expired", async () => {
    createServerHeadkitMock.mockReturnValue(sdkWithStatus("expired"));

    await expect(isCheckoutSessionDead("cs_1")).resolves.toBe(true);
  });

  it("dead when the server reports status complete", async () => {
    createServerHeadkitMock.mockReturnValue(sdkWithStatus("complete"));

    await expect(isCheckoutSessionDead("cs_1")).resolves.toBe(true);
  });

  it("reports alive when the retrieve itself fails (never guess dead)", async () => {
    createServerHeadkitMock.mockReturnValue({
      payments: {
        getCheckoutSession: vi.fn().mockRejectedValue(new Error("network")),
      },
    });

    await expect(isCheckoutSessionDead("cs_1")).resolves.toBe(false);
  });
});
