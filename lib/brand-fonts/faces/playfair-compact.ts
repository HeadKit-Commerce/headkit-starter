/**
 * next/font face module — imported only when branding selects this family/variant.
 * Keeping each loader in its own file lets unused faces drop out of the CSS graph
 * (the monolithic catalog previously injected ~80 woff2 @font-face rules per page).
 */
import { Playfair_Display } from "next/font/google";

const face = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-slot-playfair",
  weight: ["400", "500", "600"],
});

export default face;
