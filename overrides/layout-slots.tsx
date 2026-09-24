import type { ReactNode } from "react";

/**
 * Inline script in `<head>`, before the body paints. Customer-owned.
 * Use this for attributes that CSS must see on the first frame.
 * Return null when the store does not need one.
 */
export function HeadRouteScript(): ReactNode {
  return null;
}

/**
 * Sibling after `<main>` and before the footer. Must not wrap `{children}` —
 * a Suspense boundary around children breaks 308 redirects.
 */
export function BelowMain(): ReactNode {
  return null;
}
