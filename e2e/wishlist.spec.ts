import { test, expect } from "@playwright/test";
import { BASE_URL, loginViaUi, stackIsUp } from "./fixtures/helpers-2";

/**
 * Wishlist + home smoke e2e (autonomous QA run — E2E-GAPS.md Gap 11).
 *
 * Closes UAT rows P1-40 (wishlist read surface) and P1-32 (home page
 * carousels/sections + hero CTA).
 *
 * ── REAL APP GAPS FOUND WHILE AUTHORING (flagged, not silently skipped) ──
 *
 * BUG 1 — wishlist can NEVER display saved items:
 *   app/account/(private)/wishlist/page.tsx:37 passes `{ include: ids }` to
 *   `headkit.collections.list` behind a type-cast, but `ProductListFilter`
 *   (services/commerce/graph/schema.graphqls:983) has NO `include` field.
 *   The gateway rejects the query ("Field \"include\" is not defined by type
 *   \"ProductListFilter\""), the page's `.catch(() => setProducts([]))`
 *   swallows it, and a populated `hk_wishlist` always renders the EMPTY
 *   state. Verified directly against the local gateway. See the fixme test.
 *
 * BUG 2 — nothing ever WRITES `hk_wishlist`:
 *   No add/remove-wishlist control exists on the product card or PDP
 *   (grep: the only reader/writer of `hk_wishlist` is the wishlist page
 *   itself; components/headkit-ui/product-card.tsx and product-detail.tsx
 *   have no wishlist toggle). P1-40's "add from product card" path cannot
 *   be exercised. The header Heart icon (header-actions.tsx) only LINKS to
 *   /account/wishlist.
 *
 * What IS green here: the wishlist route is auth-guarded server-side
 * (proxy.ts — guests land on the sign-in form even though the data is
 * localStorage-only), the logged-in page renders its empty state with a
 * recovery CTA, and the home page renders all seeded sections with a
 * working hero CTA.
 *
 * SUSPECTED BUG 3 (observed, asserted as observation): the home
 * "Shop by Category" carousel links point at the WP ORIGIN
 * (http://localhost:8090/collections/…) because category-carousel.tsx:17
 * uses `item.uri` (the WP permalink) without converting to a storefront
 * path — clicking would bounce the shopper to the headless WordPress host.
 *
 * LOCAL-ONLY (HARD RULE): all endpoints are localhost Docker services.
 */

test.describe("Wishlist read surface + home smoke (P1-40, P1-32)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter",
    );
  });

  test("P1-40: guest hit on /account/wishlist redirects to sign-in; logged-in renders the empty state", async ({
    page,
  }) => {
    // NOTE: despite the data living ONLY in localStorage, the route is
    // auth-guarded server-side (proxy.ts PRIVATE_ACCOUNT_PATHS includes
    // /account/wishlist) — a guest never sees the page. The UAT checklist
    // assumed "works logged-out"; actual contract is guard-then-render.
    await page.goto(`${BASE_URL}/account/wishlist`);
    await page.waitForURL(/\/account(\?|$)/, { timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /^sign in$/i }).first(),
      "guest was not shown the sign-in form",
    ).toBeVisible({ timeout: 20_000 });

    await loginViaUi(page);
    await page.goto(`${BASE_URL}/account/wishlist`);
    await expect(
      page.getByRole("heading", { name: "My Wishlist" }),
      "wishlist page did not render for the logged-in user",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/your wishlist is currently empty/i),
      "empty wishlist state missing",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("link", { name: /start shopping/i }),
      "empty-state recovery CTA missing",
    ).toBeVisible();
  });

  test.fixme("P1-40 BLOCKED (app bug): seeded hk_wishlist ids render saved products", async ({
    page,
  }) => {
    // BLOCKER — real app bug, do not un-fixme until fixed:
    // app/account/(private)/wishlist/page.tsx:37 sends `{ include: ids }`
    // but ProductListFilter (schema.graphqls:983) has no `include` field →
    // gateway error → silent catch → the page ALWAYS shows the empty state.
    // Repro (fails today):
    await loginViaUi(page);
    await page.evaluate(() => {
      localStorage.setItem("hk_wishlist", JSON.stringify(["357", "678"]));
    });
    await page.goto(`${BASE_URL}/account/wishlist`);
    await expect(
      page.getByRole("heading", { name: "Classic Tee" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Test Product 12" }),
    ).toBeVisible();
    // Remove flow (also unreachable until the bug above is fixed):
    await page
      .getByRole("button", { name: "Remove from wishlist" })
      .first()
      .click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Classic Tee" }),
    ).toHaveCount(0);
  });

  test.fixme("P1-40 BLOCKED (app gap): add-to-wishlist from product card / PDP", async () => {
    // BLOCKER — no add/remove-wishlist control exists anywhere in the app.
    // `hk_wishlist` is read by app/account/(private)/wishlist/page.tsx only;
    // product-card.tsx and product-detail.tsx render no wishlist toggle, so
    // the P1-40 "add from card/PDP" journey cannot be driven. Un-fixme once
    // a wishlist toggle ships.
  });

  test("P1-32: home renders hero + all seeded sections; hero CTA navigates", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);

    // Hero carousel (seed: carousel CPT) — first slide is the page h1.
    const heroHeading = page.getByRole("heading", { level: 1 }).first();
    await expect(heroHeading, "hero carousel h1 missing").toBeVisible({
      timeout: 20_000,
    });

    // Seeded home sections all render with content.
    // New Arrivals / Latest News are no longer hardcoded on the homepage.
    for (const section of [
      "Featured Products",
      "On Sale",
      "Shop by Category",
    ]) {
      await expect(
        page.getByRole("heading", { name: section }).first(),
        `home section "${section}" missing`,
      ).toBeVisible();
    }

    // Product carousels actually carry product cards (not empty rails).
    // (The ProductCarousel `id` prop is not emitted into the DOM, so scope
    // by the section that owns each heading.)
    for (const section of ["Featured Products", "On Sale"]) {
      const rail = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: section }) });
      await expect(
        rail.locator('a[href^="/products/"]').first(),
        `${section} carousel has no product cards`,
      ).toBeVisible();
    }

    // Observation for the QA report: Shop-by-Category card links point at the
    // WP origin (category-carousel.tsx uses the raw WP permalink `uri`).
    const wpOriginLinks = await page
      .locator('a[href*="localhost:8090/collections"]')
      .count();
    test.info().annotations.push({
      type: "observation",
      description: `home category-carousel links to WP origin: ${wpOriginLinks} (should be storefront /collections/* paths — category-carousel.tsx:17)`,
    });

    // Hero CTA (first slide's button link) navigates within the storefront.
    const heroCta = page
      .locator("div.basis-full")
      .first()
      .locator('a[href^="/"]')
      .first();
    await expect(heroCta, "hero CTA link missing").toBeVisible();
    const ctaHref = await heroCta.getAttribute("href");
    expect(ctaHref, "hero CTA href empty").toBeTruthy();
    await heroCta.click();
    await page.waitForURL((url) => url.pathname === ctaHref, {
      timeout: 20_000,
    });
  });
});
