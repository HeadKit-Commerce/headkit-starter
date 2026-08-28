import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Canonical gateway env contract (FE-11 / plan 03-03).
 *
 * `NEXT_PUBLIC_GRAPHQL_URL` is the single source of truth for the Hive gateway.
 * It must be REQUIRED (loud-fail at boot) — not `.optional()` (silent undefined,
 * RESEARCH risk #8/F12). `lib/account-actions.ts` must read this canonical var
 * via the SDK auto-detect, NOT the removed divergent fallback chain
 * (`HEADKIT_GRAPHQL_URL ?? NEXT_PUBLIC_HEADKIT_GRAPHQL_URL ?? localhost:4000`).
 *
 * env.ts parses `process.env` at module import time, so each test mutates the
 * environment then imports the module fresh via `vi.resetModules()`.
 */
describe("env NEXT_PUBLIC_GRAPHQL_URL canonical contract (FE-11)", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Satisfy the other required server-schema vars so the only variable under
    // test is NEXT_PUBLIC_GRAPHQL_URL.
    process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY = "pk_local";
    process.env.HEADKIT_PRIVATE_KEY = "sk_local";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.resetModules();
  });

  it("throws (loud fail) when NEXT_PUBLIC_GRAPHQL_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_GRAPHQL_URL;
    await expect(import("./env")).rejects.toThrow();
  });

  it("throws when NEXT_PUBLIC_GRAPHQL_URL is not a valid URL", async () => {
    process.env.NEXT_PUBLIC_GRAPHQL_URL = "not-a-url";
    await expect(import("./env")).rejects.toThrow();
  });

  it("parses the canonical var when set to a valid URL", async () => {
    process.env.NEXT_PUBLIC_GRAPHQL_URL = "http://localhost:4000/graphql";
    const mod = await import("./env");
    expect(mod.env.NEXT_PUBLIC_GRAPHQL_URL).toBe(
      "http://localhost:4000/graphql",
    );
  });
});
