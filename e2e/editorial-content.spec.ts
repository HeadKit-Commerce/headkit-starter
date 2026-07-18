import { test, expect } from "@playwright/test";

/**
 * Editorial-content render + XSS + parity acceptance (Phase 08, R1/R5/R6).
 *
 * RED UNTIL PLANS 02–07 LAND. This spec is authored in Wave 0 as the phase
 * acceptance target. It WILL FAIL today: the generic `/content/{type}/{slug}`
 * WP route (02), the commerce `content()` resolver (03), the SDK `content.get`
 * (04), the storefront repoint + null-hardening (05), the shared sanitize util +
 * vendored block CSS (06), and the /sample-page repoint (07) do not exist yet.
 * It goes GREEN at the phase gate once the pipeline is built end-to-end.
 *
 * Fixtures: run docker/wordpress/seed-editorial.php against the local WP first —
 * it publishes block-test-page (page) and block-test-post (post) with wp:image /
 * wp:table / wp:quote / wp:columns blocks plus a wp:html `alert('xss')` script.
 *
 * LOCAL-ONLY (HARD RULE): baseURL is the local Docker starter (:3000, set in
 * playwright.config.ts). No staging/prod host may appear here. The full WP/Go/
 * Hive/Next stack must be up out-of-band (see playwright.config.ts).
 *
 * VALIDATION.md binding:
 *   - R6 block render + script-absent → "block render" test below
 *   - R5 news-detail parity (related/date/hero) → "news detail parity" test
 *   - R5 /sample-page no longer 404 → "sample-page returns 200" test
 *   (R1 whitelist 4xx is covered by the sibling check-whitelist.sh harness.)
 */

test.describe("Editorial content acceptance (RED until plans 02–07) — R5/R6", () => {
  test("block render: image + wp-block-* present, injected alert script absent (R6)", async ({
    page,
  }) => {
    await page.goto("/block-test-page");

    // Fidelity: the wp:image block must render a real <img> (R6 — images intact).
    await expect(
      page.locator(".wp-block-image img"),
      "block-authored <img> did not render — image fidelity regressed (R6)",
    ).not.toHaveCount(0);

    // Fidelity: the wp:table block must carry its wp-block-table class + be visible
    // (proves the vendored block CSS + preserved classes are wired).
    await expect(
      page.locator(".wp-block-table").first(),
      "wp-block-table not visible — block classes/CSS not preserved (R6)",
    ).toBeVisible();

    // XSS guard (R6): the seeded Custom-HTML `alert('xss')` script MUST be
    // stripped by the shared sanitize util — never present in the DOM.
    await expect(
      page.locator("script:has-text(\"alert('xss')\")"),
      "XSS LEAK: the seeded alert() script reached the DOM — sanitize failed (R6)",
    ).toHaveCount(0);
  });

  test("news detail parity: hero image, date, and related posts preserved (R5)", async ({
    page,
  }) => {
    await page.goto("/news/block-test-post");

    // Hero parity: FeaturedImageHeader renders the post's featured image.
    await expect(
      page.locator("img").first(),
      "news hero image missing after migration to content(POST) (R5)",
    ).toBeVisible();

    // Date parity: ArticleJsonLD emits datePublished — proves post.date survived
    // the nullability change (D-01) without regressing. Scan ALL ld+json
    // scripts: the root layout now also emits a site-wide WebSite JSON-LD
    // which renders FIRST, so `.first()` no longer reaches the Article one
    // (locator drift fixed in the autonomous QA run).
    const jsonLdBlocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(
      jsonLdBlocks.join("\n"),
      "Article JSON-LD datePublished missing — post.date regressed (R5)",
    ).toContain("datePublished");

    // Related-posts parity: the seeded siblings share the `editorial` category, so
    // the "Latest News" related-posts widget must render (relatedPosts populated).
    // Exact heading role: the footer's "Get the latest news…" heading also
    // substring-matches getByText (strict-mode drift fixed in the autonomous
    // QA run).
    await expect(
      page.getByRole("heading", { name: "Latest News", exact: true }),
      "related-posts widget missing — relatedPosts regressed on migration (R5)",
    ).toBeVisible();
  });

  test("sample-page returns 200, not 404 (R5)", async ({ page }) => {
    const response = await page.goto("/sample-page");
    expect(
      response?.status(),
      "/sample-page did not return 200 — page path still 404s (R5)",
    ).toBe(200);
    await expect(
      page.locator("body"),
      "/sample-page body did not render",
    ).toBeVisible();
  });
});
