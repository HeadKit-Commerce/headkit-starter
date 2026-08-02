import type { IconType } from "react-icons";

export type IconComponent = IconType;

// ---------------------------------------------------------------------------
// UI Icons — resolve from branding icon library via BrandingIconsProvider
// ---------------------------------------------------------------------------
export {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  MenuIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  HeartIcon,
  HomeIcon,
  SearchIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
  UserIcon,
  XCircleIcon,
  XIcon,
} from "@/components/icon/ui-icons";

// ---------------------------------------------------------------------------
// Fallback Icons — react-icons/fa6 (not available / brand-specific)
// ---------------------------------------------------------------------------
export { FaCircle as CircleIcon } from "react-icons/fa6";
export { FaSpinner as SpinnerIcon } from "react-icons/fa6";

// ---------------------------------------------------------------------------
// Social Icons — react-icons/fa6
// ---------------------------------------------------------------------------
export { FaFacebook as FacebookIcon } from "react-icons/fa6";
export { FaInstagram as InstagramIcon } from "react-icons/fa6";
export { FaDiscord as DiscordIcon } from "react-icons/fa6";
export { FaGithub as GithubIcon } from "react-icons/fa6";
export { FaLinkedin as LinkedinIcon } from "react-icons/fa6";
export { FaYoutube as YoutubeIcon } from "react-icons/fa6";

// ---------------------------------------------------------------------------
// Payment Icons — react-icons/fa6
// ---------------------------------------------------------------------------
export { FaCcVisa as VisaIcon } from "react-icons/fa6";
export { FaCcMastercard as MastercardIcon } from "react-icons/fa6";
export { FaCcAmex as AmexIcon } from "react-icons/fa6";
export { FaCcDiscover as DiscoverIcon } from "react-icons/fa6";
export { FaApplePay as ApplePayIcon } from "react-icons/fa6";
export { FaGooglePay as GooglePayIcon } from "react-icons/fa6";
export { FaPaypal as PayPalIcon } from "react-icons/fa6";
export { FaCreditCard as CreditCardIcon } from "react-icons/fa6";

/**
 * Stripe Link wallet mark (ENG-788). react-icons ships no Link icon, so this
 * is a minimal monochrome inline-SVG pill following the same IconType contract
 * as the react-icons exports (size/color/title props, currentColor default).
 */
export const LinkPayIcon: IconType = ({ size, color, title, ...rest }) => (
  <svg
    viewBox="0 0 40 24"
    width={size ?? "1em"}
    height={size ?? "1em"}
    fill={color ?? "currentColor"}
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    {title ? <title>{title}</title> : null}
    <rect
      x="1"
      y="1"
      width="38"
      height="22"
      rx="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <text
      x="20"
      y="16.5"
      textAnchor="middle"
      fontSize="12"
      fontWeight="700"
      fontFamily="inherit"
      fill="currentColor"
      stroke="none"
    >
      link
    </text>
  </svg>
);
