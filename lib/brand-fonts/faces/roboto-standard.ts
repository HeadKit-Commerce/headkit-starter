/**
 * next/font face module — imported only when branding selects this family/variant.
 * Keeping each loader in its own file lets unused faces drop out of the CSS graph
 * (the monolithic catalog previously injected ~80 woff2 @font-face rules per page).
 */
import { Roboto } from "next/font/google";

const face = Roboto({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-slot-roboto",
  weight: ["400", "500", "600", "700"],
});

export default face;
