import type { ReactNode } from "react";

export interface PageMediaSegmentProps {
  title: string;
  showTitle: boolean;
  html: string;
  formFallback?: ReactNode;
  /** False when a form already occupies the second column. */
  splitMedia: boolean;
}

/**
 * Customer layout for a CMS HTML segment that includes an image or video.
 * Starter returns null and the page stays one column.
 */
export function renderPageMediaSegment(
  _props: PageMediaSegmentProps,
): ReactNode | null {
  return null;
}

/** Rewrite page HTML before it is split or rendered. Starter leaves it as-is. */
export function preparePageHtml(html: string): string {
  return html;
}
