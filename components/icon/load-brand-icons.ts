import type {
  BrandUiIcons,
  ChromeIcons,
  BrandingIconLibrary,
} from "./brand-icon-packs/types";
import { BRANDING_ICON_LIBRARIES } from "./brand-icon-packs/types";

function resolveLibraryKey(
  library: string | null | undefined,
): BrandingIconLibrary {
  if (
    library &&
    (BRANDING_ICON_LIBRARIES as readonly string[]).includes(library)
  ) {
    return library as BrandingIconLibrary;
  }
  return "hi2";
}

/**
 * Dynamically load the selected branding icon pack so only one react-icons
 * library enters the module graph for a given request.
 */
export async function loadBrandUiIcons(
  library: string | null | undefined,
): Promise<BrandUiIcons> {
  const key = resolveLibraryKey(library);

  switch (key) {
    case "hi":
      return (await import("./brand-icon-packs/hi")).icons;
    case "lucide":
      return (await import("./brand-icon-packs/lucide")).icons;
    case "md":
      return (await import("./brand-icon-packs/md")).icons;
    case "fi":
      return (await import("./brand-icon-packs/fi")).icons;
    case "bi":
      return (await import("./brand-icon-packs/bi")).icons;
    case "bs":
      return (await import("./brand-icon-packs/bs")).icons;
    case "rx":
      return (await import("./brand-icon-packs/rx")).icons;
    case "tb":
      return (await import("./brand-icon-packs/tb")).icons;
    case "pi":
      return (await import("./brand-icon-packs/pi")).icons;
    case "ri":
      return (await import("./brand-icon-packs/ri")).icons;
    case "io5":
      return (await import("./brand-icon-packs/io5")).icons;
    case "cg":
      return (await import("./brand-icon-packs/cg")).icons;
    case "ai":
      return (await import("./brand-icon-packs/ai")).icons;
    case "fa6":
      return (await import("./brand-icon-packs/fa6")).icons;
    case "lia":
      return (await import("./brand-icon-packs/lia")).icons;
    case "ti":
      return (await import("./brand-icon-packs/ti")).icons;
    case "tfi":
      return (await import("./brand-icon-packs/tfi")).icons;
    case "hi2":
    default:
      return (await import("./brand-icon-packs/hi2")).icons;
  }
}

/** Chrome subset of the selected branding icon pack. */
export async function loadChromeIcons(
  library: string | null | undefined,
): Promise<ChromeIcons> {
  const icons = await loadBrandUiIcons(library);
  return {
    Search: icons.Search,
    Heart: icons.Heart,
    User: icons.User,
    Cart: icons.Cart,
    Phone: icons.Phone,
  };
}
