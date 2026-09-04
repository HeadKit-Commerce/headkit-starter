/** Which body the size-guide dialog should render. */
export type SizeGuideDialogKind = "html" | "blank";

/**
 * Empty CMS pages stay blank — same as the page itself.
 * Do not invent loading or "not available" copy.
 */
export function sizeGuideDialogKind(input: {
  formattedHtml: string;
}): SizeGuideDialogKind {
  return input.formattedHtml.trim() !== "" ? "html" : "blank";
}
