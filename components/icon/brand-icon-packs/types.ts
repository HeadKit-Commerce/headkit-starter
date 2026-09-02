import type { IconType } from "react-icons";

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

/** Full UI icon set formerly hardcoded to Heroicons 2. */
export type BrandUiIcons = {
  ArrowLeft: IconType;
  ArrowRight: IconType;
  ArrowUp: IconType;
  ArrowDown: IconType;
  ArrowPath: IconType;
  Menu: IconType;
  Check: IconType;
  CheckCircle: IconType;
  ChevronDown: IconType;
  ChevronLeft: IconType;
  ChevronRight: IconType;
  ChevronUp: IconType;
  ChevronsUpDown: IconType;
  Clock: IconType;
  Heart: IconType;
  Home: IconType;
  Search: IconType;
  Minus: IconType;
  Plus: IconType;
  Cart: IconType;
  User: IconType;
  Phone: IconType;
  XCircle: IconType;
  X: IconType;
};

/** Chrome subset used by header actions. */
export type ChromeIcons = Pick<
  BrandUiIcons,
  "Search" | "Heart" | "User" | "Cart" | "Phone"
>;

/** Canonical list of supported branding icon library keys. */
export const BRANDING_ICON_LIBRARIES: readonly BrandingIconLibrary[] = [
  "hi2",
  "hi",
  "lucide",
  "md",
  "fi",
  "bi",
  "bs",
  "rx",
  "tb",
  "pi",
  "ri",
  "io5",
  "cg",
  "ai",
  "fa6",
  "lia",
  "ti",
  "tfi",
] as const;
