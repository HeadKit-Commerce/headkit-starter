/**
 * Where the theme `pdp.sizeGuideHref` Size Guide control mounts on a PDP.
 *
 * - `multi-add` — Complete the set heading (preferred when companions exist)
 * - `swatch` — colour / swatch attribute label (Bundles and other non-multi-add)
 * - `size` — size attribute label when there is no colour row
 * - `standalone` — buy-box link when there are no variation attributes
 * - `none` — theme did not set a Size Guide page
 */
export type ThemeSizeGuidePlacement =
  | "multi-add"
  | "swatch"
  | "size"
  | "standalone"
  | "none";

/** Resolve a single Size Guide placement so PDPs never render two controls. */
export function themeSizeGuidePlacement(input: {
  sizeGuideHref: string | undefined;
  showMultiAdd: boolean;
  hasSwatchAttribute: boolean;
  hasSizeAttribute: boolean;
}): ThemeSizeGuidePlacement {
  if (!input.sizeGuideHref) {
    return "none";
  }
  if (input.showMultiAdd) {
    return "multi-add";
  }
  if (input.hasSwatchAttribute) {
    return "swatch";
  }
  if (input.hasSizeAttribute) {
    return "size";
  }
  return "standalone";
}
