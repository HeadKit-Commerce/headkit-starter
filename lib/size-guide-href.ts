/**
 * Theme `pdp.sizeGuideHref` must be a site-relative path (same regex as
 * `overrides/theme.schema.json`). Used to load CMS page HTML into the
 * size-guide modal without navigating away from the PDP.
 */
export const SIZE_GUIDE_HREF_PATTERN = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

/** CMS slug for `sdk.content.get`, or null when the href is not usable. */
export function cmsSlugFromSizeGuideHref(href: string): string | null {
  const trimmed = href.trim();
  if (!SIZE_GUIDE_HREF_PATTERN.test(trimmed)) {
    return null;
  }
  const slug = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return slug === "" ? null : slug;
}
