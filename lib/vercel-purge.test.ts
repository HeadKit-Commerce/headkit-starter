import { afterEach, describe, expect, it } from "vitest";

import { hasPurgeApi } from "./vercel-purge";

/**
 * `hasPurgeApi` — the probe that turns "the invalidate presumably landed" into
 * a fact in a log line.
 *
 * These cases install and remove the SAME global registry symbol that
 * `@vercel/functions` reads (`Symbol.for("@vercel/request-context")`), so they
 * exercise the real contract rather than a mock of it.
 *
 * LIMIT, and it is the whole of what matters: no test can tell whether a
 * DEPLOYED Vercel runtime installs that symbol with a `purge` on it. The symbol
 * is set by the platform, never by the SDK, so the answer only exists on a
 * deployment. That is why `purgeApi` is in the `/api/revalidate` log line and in
 * `GET /api/revalidate` — the field IS the observation. Treat a green run here
 * as proof of the probe's logic and of nothing about production.
 */

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
const globalWithContext = globalThis as Record<symbol, unknown>;

function installContext(value: unknown): void {
  globalWithContext[SYMBOL_FOR_REQ_CONTEXT] = value;
}

afterEach(() => {
  delete globalWithContext[SYMBOL_FOR_REQ_CONTEXT];
});

describe("hasPurgeApi", () => {
  it("is false with no request context at all — every local runtime", () => {
    // `next dev`, `next start`, vitest and a CI box all look like this. The
    // caller's fallback then deletes, which is correct and merely slow.
    expect(hasPurgeApi()).toBe(false);
  });

  it("is false when the context exists but carries no purge API", () => {
    installContext({ get: () => ({ waitUntil: () => {} }) });
    expect(hasPurgeApi()).toBe(false);
  });

  it("is false when the holder exposes no `get`", () => {
    installContext({});
    expect(hasPurgeApi()).toBe(false);
  });

  it("is false when `get` returns undefined", () => {
    installContext({ get: () => undefined });
    expect(hasPurgeApi()).toBe(false);
  });

  it("is TRUE when the runtime injected a purge API", () => {
    installContext({
      get: () => ({
        purge: { invalidateByTag: async (): Promise<void> => {} },
      }),
    });
    expect(hasPurgeApi()).toBe(true);
  });

  it("is false rather than throwing when `get` itself throws", () => {
    // A runtime defect must not be able to fail an authenticated webhook: the
    // probe answers false and the caller degrades to deletion. Fail towards
    // slow, never towards wrong.
    installContext({
      get: () => {
        throw new Error("context unavailable");
      },
    });
    expect(hasPurgeApi()).toBe(false);
  });
});
