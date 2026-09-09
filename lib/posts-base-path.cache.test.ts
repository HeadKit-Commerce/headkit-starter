import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getPostsLanding` is the ONE cached read of the WordPress Posts page, and
 * `getPostsBasePath` derives from it rather than reading the origin itself.
 *
 * The post route used to call `sdk.posts.getLanding()` uncached on every
 * request (~0.5 s of origin time per post view) for the payload the base-path
 * entry already held. Both entries carry the same life and tags so the theme's
 * post/page purges refresh them together.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const getLanding = vi.fn<() => Promise<unknown>>();

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));
vi.mock("@/lib/sdk", () => ({
  headkit: { posts: { getLanding: (): Promise<unknown> => getLanding() } },
}));

import { getPostsBasePath, getPostsLanding } from "./posts-base-path";
import { TAG } from "./cache-tags";

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  getLanding.mockReset();
  getLanding.mockResolvedValue({ title: "Journal", slug: "journal" });
});

describe("getPostsLanding — cached landing read", () => {
  it("caches at cacheLife('hours') under TAG.posts + TAG.pages", async () => {
    const landing = await getPostsLanding();
    expect(landing).toEqual({ title: "Journal", slug: "journal" });
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith(TAG.posts, TAG.pages);
  });

  it("resolves null instead of throwing when the origin read fails", async () => {
    getLanding.mockRejectedValue(new Error("origin unreachable"));
    await expect(getPostsLanding()).resolves.toBeNull();
  });
});

describe("getPostsBasePath — derives from the shared landing read", () => {
  it("reads the landing exactly once and normalises its slug", async () => {
    await expect(getPostsBasePath()).resolves.toBe("journal");
    expect(getLanding).toHaveBeenCalledTimes(1);
    // Same tag union as the landing entry — one purge refreshes both.
    for (const call of cacheTag.mock.calls) {
      expect(call).toEqual([TAG.posts, TAG.pages]);
    }
    for (const [profile] of cacheLife.mock.calls) {
      expect(profile).toBe("hours");
    }
  });

  it("falls back to `news` when the landing is unset", async () => {
    getLanding.mockResolvedValue(null);
    await expect(getPostsBasePath()).resolves.toBe("news");
  });
});
