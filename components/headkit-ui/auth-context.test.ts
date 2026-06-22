import { describe, expect, it, vi } from "vitest";

import {
  runSilentRefresh,
  SESSION_EXPIRED_MESSAGE,
} from "@/components/headkit-ui/auth-context";

/**
 * FE-05 silent token refresh — success + hard-failure paths.
 *
 * The provider can't render in the node vitest env (no jsdom/testing-library),
 * so the refresh orchestration is extracted into the pure `runSilentRefresh`
 * helper that the effect calls. These cover the two branches the timer drives:
 *
 *  - success → returns the new {authToken, refreshToken} so the effect swaps them
 *  - failure (throw or empty payload) → `signed-out` with the UI-SPEC copy,
 *    never leaking token internals.
 *
 * The scheduling math (30s-early, clamp-to-0, null-on-bad-exp) is covered by
 * lib/jwt-exp.test.ts; here we use fake timers to assert the refresh fires only
 * after the scheduled delay.
 */

describe("runSilentRefresh", () => {
  it("returns the new token pair on success (swap path)", async () => {
    const refreshAuthToken = vi.fn(async (token: string) => {
      expect(token).toBe("refresh-1");
      return { authToken: "new-jwt", refreshToken: "refresh-2" };
    });

    const outcome = await runSilentRefresh("refresh-1", refreshAuthToken);

    expect(refreshAuthToken).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      status: "refreshed",
      authToken: "new-jwt",
      refreshToken: "refresh-2",
    });
  });

  it("signs out with the UI-SPEC copy when the refresh call throws", async () => {
    const refreshAuthToken = vi.fn(async () => {
      throw new Error("Session expired. Please sign in again.");
    });

    const outcome = await runSilentRefresh("refresh-1", refreshAuthToken);

    expect(outcome).toEqual({
      status: "signed-out",
      message: SESSION_EXPIRED_MESSAGE,
    });
    // The thrown error detail is swallowed — the outcome carries only the
    // generic copy (no token / internal leakage).
    expect(outcome.status === "signed-out" && outcome.message).toBe(
      "Your session expired. Please sign in again.",
    );
  });

  it("signs out when the backend returns an incomplete token pair", async () => {
    const refreshAuthToken = vi.fn(async () => ({
      authToken: "",
      refreshToken: "",
    }));

    const outcome = await runSilentRefresh("refresh-1", refreshAuthToken);

    expect(outcome.status).toBe("signed-out");
  });

  it("fires only after the scheduled delay (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const refreshAuthToken = vi.fn(async () => ({
        authToken: "new-jwt",
        refreshToken: "refresh-2",
      }));

      let done = false;
      // Mirror how the effect schedules the call: setTimeout(delay) → refresh.
      setTimeout(() => {
        void runSilentRefresh("refresh-1", refreshAuthToken).then(() => {
          done = true;
        });
      }, 90_000);

      // Before the delay elapses, nothing has fired.
      await vi.advanceTimersByTimeAsync(89_999);
      expect(refreshAuthToken).not.toHaveBeenCalled();

      // After the delay, the refresh runs.
      await vi.advanceTimersByTimeAsync(1);
      expect(refreshAuthToken).toHaveBeenCalledOnce();
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never includes the token in the failure message (no leakage)", async () => {
    const secret = "super-secret-refresh-token";
    const refreshAuthToken = vi.fn(async () => {
      throw new Error(`upstream rejected ${secret}`);
    });

    const outcome = await runSilentRefresh(secret, refreshAuthToken);

    expect(outcome.status).toBe("signed-out");
    if (outcome.status === "signed-out") {
      expect(outcome.message).not.toContain(secret);
    }
  });
});
