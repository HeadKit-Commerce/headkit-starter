/**
 * The cache profile's resolution rules, its default, and which lifetime
 * actually reaches `cacheLife`.
 *
 * `STOREFRONT_CACHE_PROFILE` reads the environment ONCE at module load, so the
 * profile-dependent cases re-import the module under a stubbed env rather than
 * mutating a value. That is also the property under test: a `cacheLife` call
 * inside a `"use cache"` body must resolve the same way during a prerender and
 * at request time.
 *
 * `next/cache` is mocked to capture the call. What that covers is the DISPATCH
 * — that the right profile name, as a name and not as a union, reaches Next.
 * It does not cover Next's own async-storage plumbing, which only a real build
 * exercises.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheLife = vi.hoisted(() => vi.fn<(profile: unknown) => void>());
vi.mock("next/cache", () => ({
  cacheLife: (profile: unknown): void => cacheLife(profile),
  cacheTag: (): void => {},
}));

import {
  DEFAULT_CACHE_PROFILE,
  resolveCacheProfile,
  STOREFRONT_CACHE_PROFILE,
  cacheLifeForProfile,
} from "@/lib/cache-profile";

beforeEach(() => {
  cacheLife.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Load a fresh copy of the module under the current env. */
async function loadWithProfile(
  value: string | undefined,
): Promise<typeof import("@/lib/cache-profile")> {
  vi.resetModules();
  vi.stubEnv("HEADKIT_CACHE_PROFILE", value ?? "");
  return import("@/lib/cache-profile");
}

describe("resolveCacheProfile", () => {
  it("defaults to conservative when nothing is set", () => {
    expect(resolveCacheProfile(undefined)).toBe("conservative");
    expect(DEFAULT_CACHE_PROFILE).toBe("conservative");
  });

  it("accepts both profile names", () => {
    expect(resolveCacheProfile("conservative")).toBe("conservative");
    expect(resolveCacheProfile("aggressive")).toBe("aggressive");
  });

  it("falls back to conservative for an unrecognised value", () => {
    // Including the empty string a platform env editor writes for a variable
    // someone cleared. A typo must not silently pin the storefront's caches.
    expect(resolveCacheProfile("")).toBe("conservative");
    expect(resolveCacheProfile("Aggressive")).toBe("conservative");
    expect(resolveCacheProfile("max")).toBe("conservative");
  });
});

describe("cacheLifeForProfile", () => {
  it("applies the conservative lifetime with no profile configured", () => {
    // This is the platform default and the behaviour every storefront has
    // today: a named lifetime stays exactly the lifetime the call site names.
    expect(STOREFRONT_CACHE_PROFILE).toBe("conservative");
    cacheLifeForProfile("hours", "max");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it("applies the aggressive lifetime when the store opts in", async () => {
    const mod = await loadWithProfile("aggressive");
    expect(mod.STOREFRONT_CACHE_PROFILE).toBe("aggressive");
    mod.cacheLifeForProfile("hours", "max");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("max");
  });

  it("hands back whatever the call site named, never `max` of its own accord", async () => {
    // A carve-out raises within the finite range; the helper must not
    // substitute the profile's own idea of "aggressive".
    const mod = await loadWithProfile("aggressive");
    mod.cacheLifeForProfile("hours", "days");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("days");
  });

  it("passes an inline lifetime object straight through", async () => {
    const conservative = { stale: 1, revalidate: 2, expire: 3 };
    const aggressive = { stale: 1, revalidate: 20, expire: 30 };

    cacheLifeForProfile(conservative, aggressive);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(conservative);

    const mod = await loadWithProfile("aggressive");
    cacheLife.mockClear();
    mod.cacheLifeForProfile(conservative, aggressive);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(aggressive);
  });

  it("treats an unrecognised env value as conservative at module load", async () => {
    const mod = await loadWithProfile("agressive"); // one 'g' — a real typo
    expect(mod.STOREFRONT_CACHE_PROFILE).toBe("conservative");
    mod.cacheLifeForProfile("hours", "max");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
