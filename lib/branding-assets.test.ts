import { describe, expect, it } from "vitest";

import { resolveBrandingAssets } from "./branding-assets";

/**
 * The favicon precedence rule (plan 15.1-18, FINDING 3).
 *
 * The dashboard's Store Icon control promises the uploaded file becomes the
 * favicon. Before this rule was corrected, `iconUrl` preferred the COMMERCE
 * value — WordPress's `siteIcon`, which falls back to the WordPress *logo* when
 * unset — so an operator could upload a square icon, see a success toast, and
 * still be served a wide wordmark as the tab icon.
 *
 * The first case below is the regression guard: it fails on the old ordering.
 */
describe("resolveBrandingAssets", () => {
  it("prefers the dashboard icon over the commerce icon (the regression)", () => {
    expect(
      resolveBrandingAssets({
        dashboardIcon: "https://cdn.example/uploaded-icon.svg",
        dashboardLogo: null,
        commerceIcon: "https://wp.example/wp-content/uploads/wordmark.svg",
      }).iconUrl,
    ).toBe("https://cdn.example/uploaded-icon.svg");
  });

  it("falls back to the commerce icon when the dashboard has none — the local-stack path, where DASHBOARD_API_URL is unset", () => {
    expect(
      resolveBrandingAssets({
        dashboardIcon: null,
        dashboardLogo: null,
        commerceIcon: "https://wp.example/site-icon.png",
      }).iconUrl,
    ).toBe("https://wp.example/site-icon.png");
  });

  it("prefers the dashboard logo for the nav, and falls back to the commerce icon so an icon-only store still gets a mark", () => {
    expect(
      resolveBrandingAssets({
        dashboardIcon: null,
        dashboardLogo: "https://cdn.example/logo.svg",
        commerceIcon: "https://wp.example/site-icon.png",
      }).logoUrl,
    ).toBe("https://cdn.example/logo.svg");

    expect(
      resolveBrandingAssets({
        dashboardIcon: null,
        dashboardLogo: null,
        commerceIcon: "https://wp.example/site-icon.png",
      }).logoUrl,
    ).toBe("https://wp.example/site-icon.png");
  });

  it("returns null for both when nothing is configured, so the built-in defaults apply", () => {
    expect(
      resolveBrandingAssets({
        dashboardIcon: null,
        dashboardLogo: null,
        commerceIcon: null,
      }),
    ).toEqual({ iconUrl: null, logoUrl: null });
  });
});
