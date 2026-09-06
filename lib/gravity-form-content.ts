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

/** The marker the theme emits, built here for pages that need a default form. */
function marker(formId: string): string {
  return `<div class="headkit-gravity-form" data-form-id="${formId}" data-headkit-gf="1"></div>`;
}

/**
 * Guarantee that a page whose whole purpose is a form actually carries one.
 *
 * Returns `html` untouched when it already places at least one form — an editor
 * who placed a form has made a decision, including which form, and nothing here
 * may override it. Otherwise the default form's marker is appended after
 * whatever copy the page has.
 *
 * Why this is needed: form placement moved from CODE to PAGE CONTENT between
 * V1 and V2. The old storefront's route rendered `<GravityForm formId="1" />`
 * directly; the template instead reads a `[gravityform]` shortcode that the
 * theme turns into a marker. A store migrating across that change has a Contact
 * page full of real copy and no shortcode, because under V1 there was never any
 * reason to put one there.
 *
 * Reading `page?.content ?? <default>` applies the default only when the page
 * is ABSENT, so such a page renders its copy and no form — a contact page with
 * no contact form, answering 200. That is invisible to a status sweep and was
 * found by eye during the Dishee migration.
 */
export function withGuaranteedFormMarker(
  html: string | null | undefined,
  defaultFormId: string,
): string {
  const content = html ?? "";
  if (hasGravityFormMarker(content)) return content;
  return content.trim() === ""
    ? marker(defaultFormId)
    : content + marker(defaultFormId);
}
