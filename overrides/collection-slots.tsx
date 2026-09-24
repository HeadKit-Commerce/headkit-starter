/**
 * Collection pages render the breadcrumb trail above the heading.
 * Return false to keep the title column's no-crumb spacing. Cover CSS in
 * `overrides/styles.css` can hide the trail, but the spacing class still
 * changes when the trail is in the markup.
 */
export function showCollectionBreadcrumbs(): boolean {
  return true;
}
