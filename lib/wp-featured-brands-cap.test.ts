import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Regression guard for the homepage endpoint's Featured-brand cap — the source
 * of the storefront's client-logo band.
 *
 * The band is rendered by this app (`BrandCarousel`) from
 * `integrations/wordpress/theme/inc/rest-api/headkit-homepage.php`, and the
 * original defect was a hardcoded `10` at that file's call sites: Featured
 * `product_brand` terms are queried alphabetically, so a cap below a store's
 * Featured-brand count silently truncated the TAIL of the list. A store with 16
 * Featured brands shipped 10 and ended at "Juniper".
 *
 * The theme ships no PHP test runner and adding one (phpunit, composer dev
 * deps, a CI job) is a separate piece of work, so this guard runs the theme's
 * PHP directly out of the vitest suite that already gates every PR: it invokes
 * `integrations/wordpress/theme/tests/featured-brands-harness.php`, which shims
 * the WordPress core functions the endpoint touches, seeds N Featured brands,
 * loads the REAL endpoint file unmodified, and reports what each hydration path
 * returned. `php` is preinstalled on the `ubuntu-latest` CI runner, so no
 * toolchain setup is required. macOS has not bundled `php` since Monterey, so
 * the suite SKIPS on a developer machine without it — but FAILS in CI, where a
 * silent skip would let this regression back in the moment the runner image
 * changes.
 *
 * This is a behavioural test, not a source assertion: it fails if ANY of the
 * three call sites regresses to a literal cap, whether or not the constant is
 * still spelled in the file. Verified red against base commit 4cb692ba (10/16
 * on all three paths, ending at "Juniper") and green on the fix (16/16).
 *
 * A full PHP suite for the theme remains a worthwhile follow-up; this covers
 * the one contract the storefront depends on.
 */

const HARNESS = resolve(
  __dirname,
  "../../../integrations/wordpress/theme/tests/featured-brands-harness.php",
);

interface HarnessResult {
  seededBrands: number;
  limit: number | null;
  /** `headkit_hydrate_featured_brands()` called with no argument. */
  defaultArg: string[];
  /** `attrs.brands` on a `headkit-brand-carousel` section block. */
  editorBlock: string[];
  /** `featuredBrands.nodes` on the `/headkit/v2/homepage` payload. */
  endpoint: string[];
}

/** Every path the endpoint hydrates the client-logo band through. */
const PATHS = ["defaultArg", "editorBlock", "endpoint"] as const;

/** A working `php` on PATH — the harness is executed, not parsed. */
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

const SUITE = "WordPress homepage endpoint: Featured brand hydration";
const SKIPPING = !PHP_AVAILABLE && !IS_CI;
// Carried in the suite title so the reporter says WHY it was skipped — skipIf
// itself takes no message. Only when it really skips: in CI the missing
// runtime is a failure, and the beforeAll below says so.
const SUITE_TITLE = SKIPPING
  ? `${SUITE} [skipped: requires \`php\` on PATH]`
  : SUITE;

function hydrate(config: {
  brands: number;
  limitOverride?: number;
}): HarnessResult {
  const stdout = execFileSync("php", [HARNESS, JSON.stringify(config)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout) as HarnessResult;
}

describe.skipIf(SKIPPING)(SUITE_TITLE, () => {
  beforeAll(() => {
    // Only reachable in CI: the local run without `php` skipped above. A
    // missing runtime here means the runner image stopped shipping it, and
    // skipping would silently drop the only guard on this regression.
    if (!PHP_AVAILABLE) {
      throw new Error(
        "`php` is not on PATH. CI is expected to provide it — `ubuntu-latest` " +
          "ships PHP preinstalled — so this suite fails rather than skipping. " +
          "Install php on the runner, or run locally where it skips instead.",
      );
    }
  });

  it("returns every Featured brand a real store has, on all three paths", () => {
    // 16 is the count that exposed the bug (Pebblr's Featured product_brand
    // terms). Alphabetical order makes truncation identifiable by name.
    const result = hydrate({ brands: 16 });

    for (const path of PATHS) {
      expect(
        result[path],
        `${path} truncated the client-logo band`,
      ).toHaveLength(16);
      expect(result[path][0]).toBe("Aurora");
      // "Juniper" is #10 — where the old hardcoded cap cut the list off.
      expect(result[path].at(-1)).toBe("Pinegrove");
    }
  });

  it("caps by the shared constant, so no call site carries its own literal", () => {
    // wp-config.php can lower HEADKIT_FEATURED_BRANDS_LIMIT (the theme's
    // define() is !defined()-guarded). If a call site passed its own number
    // instead, that path would ignore the override and still return 16.
    const result = hydrate({ brands: 16, limitOverride: 4 });

    expect(result.limit).toBe(4);
    for (const path of PATHS) {
      expect(
        result[path],
        `${path} ignored HEADKIT_FEATURED_BRANDS_LIMIT`,
      ).toEqual(["Aurora", "Bellweather", "Cinder", "Driftwood"]);
    }
  });
});
