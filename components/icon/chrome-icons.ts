/**
 * Chrome icon helpers — re-exported from brand icon resolution so
 * header actions and existing tests keep working.
 *
 * Prefer `loadChromeIcons` / `loadBrandUiIcons` so only the selected pack
 * is loaded. Sync `resolveChromeIcons` always returns hi2.
 */
export {
  resolveChromeIcons,
  resolveBrandUiIcons,
  isBrandingIconLibrary,
  BRAND_UI_ICON_MAP as CHROME_ICON_MAP,
  type BrandingIconLibrary,
  type ChromeIcons,
  type BrandUiIcons,
} from "@/components/icon/brand-icons";

export {
  loadBrandUiIcons,
  loadChromeIcons,
} from "@/components/icon/load-brand-icons";
