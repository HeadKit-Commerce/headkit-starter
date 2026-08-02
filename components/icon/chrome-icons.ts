import type { IconType } from "react-icons";
import {
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlineShoppingBag,
  HiOutlineUser,
} from "react-icons/hi2";
import {
  HiOutlineHeart as Hi1Heart,
  HiOutlineSearch as Hi1Search,
  HiOutlineShoppingBag as Hi1Cart,
  HiOutlineUser as Hi1User,
} from "react-icons/hi";
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
import {
  BsHeart,
  BsPerson,
  BsSearch,
  BsCart3,
} from "react-icons/bs";
import {
  RxHeart,
  RxMagnifyingGlass,
  RxPerson,
  RxCube,
} from "react-icons/rx";
import {
  TbHeart,
  TbSearch,
  TbShoppingBag,
  TbUser,
} from "react-icons/tb";
import {
  PiHeart,
  PiMagnifyingGlass,
  PiShoppingBag,
  PiUser,
} from "react-icons/pi";
import {
  RiHeartLine,
  RiSearchLine,
  RiShoppingBagLine,
  RiUserLine,
} from "react-icons/ri";
import {
  IoCartOutline,
  IoHeartOutline,
  IoPersonOutline,
  IoSearchOutline,
} from "react-icons/io5";
import {
  CgHeart,
  CgSearch,
  CgShoppingBag,
  CgUser,
} from "react-icons/cg";
import {
  AiOutlineHeart,
  AiOutlineSearch,
  AiOutlineShoppingCart,
  AiOutlineUser,
} from "react-icons/ai";
import {
  FaCartShopping,
  FaMagnifyingGlass,
  FaRegHeart,
  FaRegUser,
} from "react-icons/fa6";
import {
  LiaHeart,
  LiaSearchSolid,
  LiaShoppingBagSolid,
  LiaUser,
} from "react-icons/lia";
import {
  TiHeartOutline,
  TiShoppingCart,
  TiUserOutline,
  TiZoomOutline,
} from "react-icons/ti";
import {
  TfiHeart,
  TfiSearch,
  TfiShoppingCart,
  TfiUser,
} from "react-icons/tfi";

export type BrandingIconLibrary =
  | "hi2"
  | "hi"
  | "lucide"
  | "md"
  | "fi"
  | "bi"
  | "bs"
  | "rx"
  | "tb"
  | "pi"
  | "ri"
  | "io5"
  | "cg"
  | "ai"
  | "fa6"
  | "lia"
  | "ti"
  | "tfi";

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
  hi: {
    Search: Hi1Search,
    Heart: Hi1Heart,
    User: Hi1User,
    Cart: Hi1Cart,
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
  bs: {
    Search: BsSearch,
    Heart: BsHeart,
    User: BsPerson,
    Cart: BsCart3,
  },
  rx: {
    Search: RxMagnifyingGlass,
    Heart: RxHeart,
    User: RxPerson,
    Cart: RxCube,
  },
  tb: {
    Search: TbSearch,
    Heart: TbHeart,
    User: TbUser,
    Cart: TbShoppingBag,
  },
  pi: {
    Search: PiMagnifyingGlass,
    Heart: PiHeart,
    User: PiUser,
    Cart: PiShoppingBag,
  },
  ri: {
    Search: RiSearchLine,
    Heart: RiHeartLine,
    User: RiUserLine,
    Cart: RiShoppingBagLine,
  },
  io5: {
    Search: IoSearchOutline,
    Heart: IoHeartOutline,
    User: IoPersonOutline,
    Cart: IoCartOutline,
  },
  cg: {
    Search: CgSearch,
    Heart: CgHeart,
    User: CgUser,
    Cart: CgShoppingBag,
  },
  ai: {
    Search: AiOutlineSearch,
    Heart: AiOutlineHeart,
    User: AiOutlineUser,
    Cart: AiOutlineShoppingCart,
  },
  fa6: {
    Search: FaMagnifyingGlass,
    Heart: FaRegHeart,
    User: FaRegUser,
    Cart: FaCartShopping,
  },
  lia: {
    Search: LiaSearchSolid,
    Heart: LiaHeart,
    User: LiaUser,
    Cart: LiaShoppingBagSolid,
  },
  ti: {
    Search: TiZoomOutline,
    Heart: TiHeartOutline,
    User: TiUserOutline,
    Cart: TiShoppingCart,
  },
  tfi: {
    Search: TfiSearch,
    Heart: TfiHeart,
    User: TfiUser,
    Cart: TfiShoppingCart,
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
