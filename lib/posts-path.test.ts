import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import {
  DEFAULT_POSTS_BASE_PATH,
  normalizePostsBasePath,
  postsIndexPath,
} from "./posts-path";

/**
 * Guard for the `/posts` ⇄ `/news` infinite redirect loop.
 *
 * `next.config.ts` 308s `/posts` (and `/posts/:slug*`) to `/news`
 * unconditionally, while `proxy.ts` 308s `/news` out to the store's own
 * WordPress Posts-page slug whenever that slug is not `news`. On a store whose
 * Posts page is literally `posts` the two rules are exact inverses, and the
 * whole blog namespace answers ERR_TOO_MANY_REDIRECTS. `RESERVED_POSTS_BASE`
 * exists precisely to stop a storefront route becoming the blog base — and a
 * `redirects()` source IS a storefront route, which is the part that was
 * missed.
 *
 * The invariant is asserted against the LIVE config rather than against the
 * string "posts", because the class is "a legacy redirect source colliding with
 * a blog base", not that one slug: adding a redirect for `/journal` tomorrow
 * without reserving it recreates the identical loop.
 */
describe("no redirects() source can become a blog base path", () => {
  it("every redirect source is reserved", async () => {
    const rules = await nextConfig.redirects!();
    expect(
      rules.length,
      "next.config.ts declares no redirects",
    ).toBeGreaterThan(0);

    for (const { source } of rules) {
      // "/posts/:slug*" -> "posts";  "/(.*)" -> skipped
      const first = source.split("/")[1] ?? "";
      const segment = first.split(":")[0] ?? "";
      if (!segment || segment.includes("(")) continue;

      expect(
        normalizePostsBasePath(segment),
        `next.config.ts redirects "${source}" away, so a store whose ` +
          `WordPress Posts slug is "${segment}" would have proxy.ts 308 ` +
          `/${DEFAULT_POSTS_BASE_PATH} → /${segment} while next.config.ts 308s ` +
          `it straight back. Add "${segment}" to RESERVED_POSTS_BASE in ` +
          `lib/posts-path.ts.`,
      ).toBeNull();
    }
  });

  it("`posts` resolves to the default blog base, not to itself", () => {
    // The store this was found on: WordPress Settings → Reading → Posts page
    // slug is literally `posts`.
    expect(normalizePostsBasePath("posts")).toBeNull();
    expect(postsIndexPath("posts")).toBe(`/${DEFAULT_POSTS_BASE_PATH}`);
  });
});

/**
 * The second, independent loop generator: `app/[...slug]/page.tsx` redirected
 * the WordPress Posts page to a hard-coded `/news`. It now derives the target
 * from the same normalised resolver and no-ops when the target equals the
 * requested path. This asserts the resolver half of that rule — the route half
 * is structural and lives in `app/not-found-status.test.ts`.
 */
describe("the Posts-page redirect target can never equal the request", () => {
  it.each([
    "posts",
    DEFAULT_POSTS_BASE_PATH,
    "shop",
    "account",
    "insights",
    "our-journal",
  ])("a store whose Posts slug is %s does not self-redirect", (slug) => {
    const requested = `/${slug}`;
    const target = postsIndexPath(slug);
    const wouldRedirect = target !== requested;

    if (normalizePostsBasePath(slug) === null) {
      // A reserved (or default) slug resolves to the shared blog index, so the
      // route must either send it there or serve it — never bounce it to
      // itself, and never to a path proxy.ts is simultaneously sending back.
      expect(target).toBe(`/${DEFAULT_POSTS_BASE_PATH}`);
      expect(wouldRedirect).toBe(slug !== DEFAULT_POSTS_BASE_PATH);
    } else {
      // A usable base is its own index: the request IS the target, so the
      // guard must make this a no-op.
      expect(target).toBe(requested);
      expect(
        wouldRedirect,
        `a store whose Posts slug is "${slug}" would be redirected to the ` +
          `path it just requested — an infinite loop.`,
      ).toBe(false);
    }
  });
});
