/** Client fetch of `pdp.sizeGuideHref` CMS HTML for the size-guide modal. */
export type SizeGuideFetchState = "idle" | "loading" | "done";

/** Which copy the size-guide dialog should render. */
export type SizeGuideDialogKind = "html" | "loading" | "empty";

export const SIZE_GUIDE_LOADING_COPY = "Loading size guide…";
export const SIZE_GUIDE_EMPTY_COPY = "Size guide is not available yet.";

/**
 * Empty CMS pages and failed fetches must not stay on "Loading…".
 * HTML wins even while a remote fetch is in flight (product metafield).
 */
export function sizeGuideDialogKind(input: {
  formattedHtml: string;
  pageHref?: string;
  fetchState: SizeGuideFetchState;
}): SizeGuideDialogKind {
  if (input.formattedHtml.trim() !== "") {
    return "html";
  }
  if (input.pageHref && input.fetchState === "loading") {
    return "loading";
  }
  return "empty";
}
