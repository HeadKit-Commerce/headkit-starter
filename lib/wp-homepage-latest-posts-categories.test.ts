import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Regression guard for the homepage endpoint's legacy `latestPosts` field —
 * the "The Latest" band's data source on a store that does not lay the
 * `headkit-post-carousel` Gutenberg block on its front page (Bike Society).
 *
 * Callan's Vercel pin (`nMAGHoS2N5ms`) traced a missing category label on the
 * home "The Latest" cards to `integrations/wordpress/theme/inc/rest-api/headkit-homepage.php`'s
 * inline post-formatting loop for `$result['latestPosts']`, which omitted
 * `categories` — unlike `headkit_format_post_summary()` (used by
 * `/headkit/v2/posts` and the block-editor `attrs.posts` hydration), which
 * already emitted it.
 *
 * Same rationale as `wp-featured-brands-cap.test.ts`: the theme ships no PHP
 * test runner, so this drives `tests/homepage-latest-posts-categories-harness.php`
 * directly out of the vitest suite that already gates every PR. `php` is
 * preinstalled on the `ubuntu-latest` CI runner; this suite SKIPS locally
 * without it but FAILS in CI, so a missing runtime can't silently drop the
 * guard.
 */

const HARNESS = resolve(
  __dirname,
  "../../../integrations/wordpress/theme/tests/homepage-latest-posts-categories-harness.php",
);

interface HarnessPost {
  slug: string;
  categories: Array<{ id: number; name: string; slug: string }>;
}

interface HarnessResult {
  latestPosts: HarnessPost[];
}

function hasPhp(): boolean {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PHP_AVAILABLE = hasPhp();
const IS_CI = Boolean(process.env.CI);

const SUITE = "WordPress homepage endpoint: latestPosts category hydration";
const SKIPPING = !PHP_AVAILABLE && !IS_CI;
const SUITE_TITLE = SKIPPING
  ? `${SUITE} [skipped: requires \`php\` on PATH]`
  : SUITE;

function hydrate(): HarnessResult {
  const stdout = execFileSync("php", [HARNESS], { encoding: "utf8" });
  return JSON.parse(stdout) as HarnessResult;
}

describe.skipIf(SKIPPING)(SUITE_TITLE, () => {
  beforeAll(() => {
    if (!PHP_AVAILABLE) {
      throw new Error(
        "`php` is not on PATH. CI is expected to provide it — `ubuntu-latest` " +
          "ships PHP preinstalled — so this suite fails rather than skipping. " +
          "Install php on the runner, or run locally where it skips instead.",
      );
    }
  });

  it("carries each post's categories onto the legacy latestPosts node", () => {
    const result = hydrate();
    const withCategory = result.latestPosts.find(
      (p) => p.slug === "winter-ride-guide",
    );
    const withoutCategory = result.latestPosts.find(
      (p) => p.slug === "shop-update",
    );

    expect(withCategory?.categories).toEqual([
      { id: 3, name: "Society News", slug: "society-news" },
    ]);
    expect(withoutCategory?.categories).toEqual([]);
  });
});
