/**
 * Branding icon resolution — sync hi2 fallback only.
 * Prefer `loadBrandUiIcons` / `loadChromeIcons` so unused packs stay out of the bundle.
 */
import { icons as hi2Icons } from "./brand-icon-packs/hi2";
import {
  BRANDING_ICON_LIBRARIES,
  type BrandingIconLibrary,
  type BrandUiIcons,
  type ChromeIcons,
} from "./brand-icon-packs/types";

export type { BrandingIconLibrary, BrandUiIcons, ChromeIcons };
export { BRANDING_ICON_LIBRARIES };

const BRANDING_ICON_LIBRARY_SET = new Set<string>(BRANDING_ICON_LIBRARIES);

/**
 * Sync resolver used by tests and non-async callers.
 * Always returns the hi2 pack — other libraries must use `loadBrandUiIcons`.
 */
export function resolveBrandUiIcons(
  _library?: string | null | undefined,
): BrandUiIcons {
  return hi2Icons;
}

/** Sync chrome subset (hi2 only). Prefer `loadChromeIcons` for other packs. */
export function resolveChromeIcons(
  library?: string | null | undefined,
): ChromeIcons {
  const icons = resolveBrandUiIcons(library);
  return {
    Search: icons.Search,
    Heart: icons.Heart,
    User: icons.User,
    Cart: icons.Cart,
    Phone: icons.Phone,
  };
}

export function isBrandingIconLibrary(
  value: string | null | undefined,
): value is BrandingIconLibrary {
  return Boolean(value && BRANDING_ICON_LIBRARY_SET.has(value));
}

/** @deprecated Sync map removed for code-splitting; hi2 only. Use loadBrandUiIcons. */
export const BRAND_UI_ICON_MAP: Partial<
  Record<BrandingIconLibrary, BrandUiIcons>
> = {
  hi2: hi2Icons,
};
