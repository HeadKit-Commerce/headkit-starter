/**
 * next/font face module — imported only when branding selects this family/variant.
 * Keeping each loader in its own file lets unused faces drop out of the CSS graph
 * (the monolithic catalog previously injected ~80 woff2 @font-face rules per page).
 */
import { DM_Sans } from "next/font/google";

const face = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-slot-dm-sans",
  weight: ["400", "500", "600"],
});

export default face;
