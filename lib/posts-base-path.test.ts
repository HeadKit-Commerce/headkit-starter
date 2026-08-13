import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTS_BASE_PATH,
  normalizePostsBasePath,
  postsArticlePath,
  postsIndexPath,
  resolvePostHref,
} from "./posts-path";

describe("normalizePostsBasePath", () => {
  it("accepts a simple posts-page slug", () => {
    expect(normalizePostsBasePath("insights")).toBe("insights");
    expect(normalizePostsBasePath("/News/")).toBe("news");
    expect(normalizePostsBasePath("our-journal")).toBe("our-journal");
  });

  it("rejects reserved storefront routes", () => {
    expect(normalizePostsBasePath("shop")).toBeNull();
    expect(normalizePostsBasePath("collections")).toBeNull();
    expect(normalizePostsBasePath("account")).toBeNull();
  });

  it("rejects nested or unsafe values", () => {
    expect(normalizePostsBasePath("a/b")).toBeNull();
    expect(normalizePostsBasePath("../x")).toBeNull();
    expect(normalizePostsBasePath("")).toBeNull();
    expect(normalizePostsBasePath(null)).toBeNull();
  });
});

describe("posts path helpers", () => {
  it("builds index and article paths", () => {
    expect(postsIndexPath("insights")).toBe("/insights");
    expect(postsArticlePath("insights", "hello-world")).toBe(
      "/insights/hello-world",
    );
    expect(postsIndexPath("shop")).toBe(`/${DEFAULT_POSTS_BASE_PATH}`);
  });

  it("resolves absolute URI, relative URI, or bare slug", () => {
    expect(resolvePostHref("/insights/hello", "news")).toBe("/insights/hello");
    expect(resolvePostHref("hello", "insights")).toBe("/insights/hello");
    expect(resolvePostHref("https://example.com/x")).toBe(
      "https://example.com/x",
    );
  });
});
