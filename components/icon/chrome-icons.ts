import type { IconType } from "react-icons";
import {
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlineShoppingBag,
  HiOutlineUser,
} from "react-icons/hi2";
import {
  LuHeart,
  LuSearch,
  LuShoppingBag,
  LuUser,
} from "react-icons/lu";
import {
  MdFavoriteBorder,
  MdOutlinePersonOutline,
  MdOutlineSearch,
  MdOutlineShoppingBag,
} from "react-icons/md";
import {
  FiHeart,
  FiSearch,
  FiShoppingBag,
  FiUser,
} from "react-icons/fi";
import {
  BiHeart,
  BiSearch,
  BiShoppingBag,
  BiUser,
} from "react-icons/bi";

export type BrandingIconLibrary = "hi2" | "lucide" | "md" | "fi" | "bi";

export type ChromeIcons = {
  Search: IconType;
  Heart: IconType;
  User: IconType;
  Cart: IconType;
};

/**
 * Named imports per library — never import the whole react-icons package.
 * Default remains Heroicons 2 (current starter).
 */
export const CHROME_ICON_MAP: Record<BrandingIconLibrary, ChromeIcons> = {
  hi2: {
    Search: HiOutlineMagnifyingGlass,
    Heart: HiOutlineHeart,
    User: HiOutlineUser,
    Cart: HiOutlineShoppingBag,
  },
  lucide: {
    Search: LuSearch,
    Heart: LuHeart,
    User: LuUser,
    Cart: LuShoppingBag,
  },
  md: {
    Search: MdOutlineSearch,
    Heart: MdFavoriteBorder,
    User: MdOutlinePersonOutline,
    Cart: MdOutlineShoppingBag,
  },
  fi: {
    Search: FiSearch,
    Heart: FiHeart,
    User: FiUser,
    Cart: FiShoppingBag,
  },
  bi: {
    Search: BiSearch,
    Heart: BiHeart,
    User: BiUser,
    Cart: BiShoppingBag,
  },
};

export function resolveChromeIcons(
  library: string | null | undefined,
): ChromeIcons {
  if (library && library in CHROME_ICON_MAP) {
    return CHROME_ICON_MAP[library as BrandingIconLibrary];
  }
  return CHROME_ICON_MAP.hi2;
}

export function isBrandingIconLibrary(
  value: string | null | undefined,
): value is BrandingIconLibrary {
  return Boolean(value && value in CHROME_ICON_MAP);
}
