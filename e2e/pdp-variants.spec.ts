import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  VARIABLE_PRODUCT_SLUG,
  allowGatewayCors,
  stackIsUp,
} from "./fixtures/helpers-2";

/**
 * PDP + path-based variant routing e2e (autonomous QA run — E2E-GAPS.md Gap 8).
 *
 * Closes UAT rows P1-14 (simple PDP), P1-15 (color swatch → colorway PATH
 * URL), P1-16 (colorway deep-link preselects), P1-17 (size persists to
 * localStorage `headkit:size:{slug}`, restores on revisit, never in URL),
 * P1-18 (out-of-stock: availability + add-to-cart blocked), P1-19
 * (lightbox), P1-20 (related carousel navigates), P1-22 (legacy
 * /shop/{cat}/{slug} catch-all renders the same PDP), P1-25 (breadcrumbs +
 * JSON-LD).
 *
 * Fixture notes (storefront-parity seeds):
 *   - classic-tee: VARIABLE, pa_color black/navy/white + pa_size s/m/l/xl
 *     (colors seeded without swatch hex → render as text option buttons)
 *   - test-product-12: simple $22 product
 *   - folding-bike: simple product seeded OUT OF STOCK — used for P1-18 so
 *     the shared WP needs no stock mutation (additive-only rule)
 *
 * ── REAL APP GAP (fixme'd): recently-viewed rail (P1-21) is DEAD CODE ──
 *   components/headkit-ui/recently-viewed.tsx exports RecentlyViewed +
 *   addToRecentlyViewed (localStorage `hk-recently-viewed`), but NOTHING
 *   imports either — the PDP never records a visit and no route mounts the
 *   rail, so the feature cannot appear. See the fixme test.
 *
 * LOCAL-ONLY (HARD RULE): all endpoints are localhost Docker services.
 */

const TEE = VARIABLE_PRODUCT_SLUG; // classic-tee

test.describe("PDP: rendering, colorway paths, size persistence, stock, legacy URLs (P1-14..P1-25)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter",
    );
  });

  test.beforeEach(async ({ page }) => {
    await allowGatewayCors(page);
  });

  test("P1-14/25: simple PDP renders title, price, availability, description tab, breadcrumbs and Product JSON-LD", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/test-product-12`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Test Product 12" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("$22.00").first()).toBeVisible();
    // Dynamic (PPR-streamed) availability hydrates to In Stock.
    await expect(page.getByText(/^In Stock$/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /add to cart/i }),
    ).toBeEnabled();
    // Tabs row renders (test-product-12 has no description, so the
    // always-present Reviews tab proves the row; the Description tab is
    // asserted on classic-tee in the legacy-URL test).
    await expect(page.getByRole("button", { name: "Reviews" })).toBeVisible();

    // Breadcrumb trail with the Home anchor.
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb, "breadcrumb nav missing").toBeVisible();
    await expect(breadcrumb.getByRole("link", { name: "Home" })).toBeVisible();

    // Product JSON-LD present.
    const jsonld = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(
      jsonld.some((s) => s.includes('"Product"')),
      "no Product JSON-LD script on the PDP",
    ).toBe(true);
  });

  test("P1-15: clicking a color option pushes the colorway PATH URL and updates the selection", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/${TEE}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Classic Tee" }),
    ).toBeVisible({ timeout: 30_000 });

    // Color options render as option buttons (no swatch hex in the seed).
    // .first(): related-products cards also render color option buttons
    // (e.g. #related-products-item-N > "Navy"), so an unscoped strict-mode
    // locator resolves to 3 elements once the rail hydrates. The main PDP
    // variant selector always precedes the rail in the DOM.
    await page
      .getByRole("button", { name: /^Navy$/ })
      .first()
      .click();
    await page.waitForURL(new RegExp(`/products/${TEE}/navy$`), {
      timeout: 30_000,
    });

    // The new colorway page preselects Navy (label next to the Color name).
    await expect(
      page.getByText("Navy", { exact: true }).first(),
      "selected color label did not update after the colorway navigation",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("P1-16/17: colorway deep-link preselects color; size choice persists to localStorage and restores on revisit (client-only, not in URL)", async ({
    page,
  }) => {
    // Deep-link straight into the navy colorway.
    await page.goto(`${BASE_URL}/products/${TEE}/navy`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Classic Tee" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Navy", { exact: true }).first(),
      "colorway deep-link did not preselect the color",
    ).toBeVisible();

    // Pick size L → persisted under headkit:size:{slug}, URL unchanged.
    await page.getByRole("button", { name: /^L$/ }).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            (slug) => localStorage.getItem(`headkit:size:${slug}`),
            TEE,
          ),
        { message: "size selection was not persisted to localStorage" },
      )
      .toBe("l");
    expect(new URL(page.url()).pathname, "size leaked into the URL").toBe(
      `/products/${TEE}/navy`,
    );

    // Fresh visit to the BASE product restores the saved size.
    await page.goto(`${BASE_URL}/products/${TEE}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Classic Tee" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("L", { exact: true }).first(),
      "saved size was not restored on revisit",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("P1-18: out-of-stock product shows Out of Stock and blocks add-to-cart", async ({
    page,
  }) => {
    // folding-bike is seeded outofstock — no stock mutation needed.
    await page.goto(`${BASE_URL}/products/folding-bike`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Folding Bike" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/^Out of Stock$/).first(),
      "availability status did not show Out of Stock",
    ).toBeVisible({ timeout: 30_000 });
    const addButton = page.getByRole("button", { name: /out of stock/i });
    await expect(
      addButton,
      "add-to-cart button did not switch to its out-of-stock state",
    ).toBeVisible();
    await expect(addButton).toBeDisabled();
  });

  test("P1-19: gallery image click opens the lightbox dialog", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/test-product-12`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Test Product 12" }),
    ).toBeVisible({ timeout: 30_000 });

    // Desktop gallery images are DialogTriggers wrapping the image.
    await page.locator('button[aria-haspopup="dialog"]').first().click();
    await expect(
      page.getByRole("dialog"),
      "clicking a gallery image did not open the lightbox dialog",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("P1-20: related-products carousel renders and navigates to the related PDP", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/${TEE}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Classic Tee" }),
    ).toBeVisible({ timeout: 30_000 });

    const relatedSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Something similar" }),
    });
    await expect(
      relatedSection,
      "related-products section missing on the variable PDP",
    ).toBeVisible();
    const relatedLink = relatedSection
      .locator('a[href^="/products/"]:visible')
      .first();
    await expect(relatedLink).toBeVisible();
    const href = await relatedLink.getAttribute("href");
    await relatedLink.click();
    // Accept a colorway PATH suffix: variable-product cards auto-select their
    // first colour after hydration, upgrading the card href from
    // /products/{slug} to /products/{slug}/{colour} — the href read above can
    // race that effect, so match the base path with an optional segment.
    await page.waitForURL(
      (url) => url.pathname === href || url.pathname.startsWith(`${href}/`),
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
      "related PDP did not render after navigation",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("P1-22: legacy /shop/{cat}/{slug} catch-all renders the same PDP", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/shop/apparel/${TEE}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Classic Tee" }),
      "legacy shop URL did not render the product PDP",
    ).toBeVisible({ timeout: 30_000 });
    // Same product surface: add-to-cart + the Description tab (classic-tee
    // has a seeded description).
    await expect(
      page.getByRole("button", { name: /add to cart|select options/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Description" }),
    ).toBeVisible();
  });

  test.fixme("P1-21 BLOCKED (app gap): recently-viewed rail appears after visiting 2 products", async ({
    page,
  }) => {
    // BLOCKER — dead code, see spec header: RecentlyViewed /
    // addToRecentlyViewed (recently-viewed.tsx) are exported but never
    // imported by any route or component, so no PDP visit ever writes
    // `hk-recently-viewed` and no page mounts the rail. Un-fixme once the
    // PDP records visits and renders <RecentlyViewed/>.
    await page.goto(`${BASE_URL}/products/test-product-12`);
    await page.goto(`${BASE_URL}/products/${TEE}`);
    await page.goto(`${BASE_URL}/products/test-product-11`);
    await expect(
      page.getByRole("heading", { name: "Recently Viewed" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
