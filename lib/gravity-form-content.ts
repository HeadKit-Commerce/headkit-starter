/**
 * HeadKit Gravity Forms markers emitted by the WordPress theme when a
 * `[gravityform]` shortcode or GF block is present on a page.
 *
 * Theme filter (`headkit_replace_gf_shortcodes_with_markers`) replaces the
 * shortcode/block output with:
 *   <div class="headkit-gravity-form" data-form-id="{id}" data-headkit-gf="1"></div>
 * so the storefront can hydrate the React GravityForm instead of shipping GF's
 * classic PHP markup through the headless content pipeline.
 */

const MARKER_RE =
  /<div\b[^>]*\bclass="[^"]*\bheadkit-gravity-form\b[^"]*"[^>]*>\s*<\/div>/gi;

const FORM_ID_RE = /\bdata-form-id="(\d+)"/i;

/** True when sanitized/raw HTML contains at least one HeadKit GF marker. */
export function hasGravityFormMarker(html: string): boolean {
  return extractGravityFormIds(html).length > 0;
}

/**
 * Form ids from HeadKit GF markers, in document order. Invalid / missing ids
 * are skipped.
 */
export function extractGravityFormIds(html: string): string[] {
  const ids: string[] = [];
  for (const match of html.matchAll(MARKER_RE)) {
    const id = FORM_ID_RE.exec(match[0] ?? "")?.[1];
    if (id) ids.push(id);
  }
  return ids;
}

/** Remove HeadKit GF markers so remaining HTML can render as editorial copy. */
export function removeGravityFormMarkers(html: string): string {
  return html.replace(MARKER_RE, "").trim();
}
