/**
 * Per-store logo + icon resolution — the precedence rule only.
 *
 * Deliberately dependency-free (no `next`, no `@/lib`, no SDK) so it is
 * unit-testable without a backend or the Next cache runtime. Its caller,
 * {@link import("./branding").getBrandingAssets}, carries `"use cache: remote"`
 * and cannot be imported into a unit test at all — which is precisely why this
 * ordering went untested, and could therefore be wrong in production without a
 * single test failing.
 */

/** Per-store logo + icon URLs resolved for the storefront head + nav. */
export interface BrandingAssets {
  /** Nav/site logo URL, or null → render the default `<Logo/>`. */
  logoUrl: string | null;
  /** Favicon / OG-share icon URL, or null → keep the file-convention default. */
  iconUrl: string | null;
}

/** The two transports a store's assets can arrive on. */
export interface BrandingAssetSources {
  /** `store.branding.iconUrl` — what the dashboard's Store Icon control writes. */
  dashboardIcon: string | null;
  /** `store.branding.logoUrl` — what the dashboard's Store Logo control writes. */
  dashboardLogo: string | null;
  /** `commerce.branding.iconUrl` — WordPress `siteIcon`, falling back to the WP logo. */
  commerceIcon: string | null;
}

/**
 * Merge the two branding transports.
 *
 * `iconUrl` prefers the DASHBOARD value. The dashboard's Store Icon control
 * states "Upload your icon and we will convert for favicon, webclip and Apple
 * touch", and that upload writes `store.branding.iconUrl`. While the favicon
 * read the commerce value first — WordPress's `siteIcon`, which falls back to
 * the WordPress *logo* when unset — a store with no WP site icon would upload a
 * square icon, get a success toast, and still be served a wide wordmark as its
 * tab icon, with no way to correct it from the dashboard. Observed on the Dishee
 * migration rehearsal (plan 15.1-18, FINDING 3).
 *
 * Commerce remains the fallback, which preserves the original reason it came
 * first: on the local stack `DASHBOARD_API_URL` is unset, so the dashboard
 * branch resolves to `null` and the commerce value is used exactly as before.
 *
 * `logoUrl` prefers the dashboard logo — the only real logo field — and falls
 * back to the commerce icon so a store that set only an icon still renders a
 * branded mark rather than the HeadKit default.
 */
export function resolveBrandingAssets(
  sources: BrandingAssetSources,
): BrandingAssets {
  return {
    iconUrl: sources.dashboardIcon ?? sources.commerceIcon,
    logoUrl: sources.dashboardLogo ?? sources.commerceIcon,
  };
}
