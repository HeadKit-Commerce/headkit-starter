/**
 * Lazy face loaders for curated Google fonts. Each path is a separate module so
 * Next only ships @font-face CSS for faces that `resolveBrandFonts` actually imports.
 */
import type { NextFontWithVariable } from "next/dist/compiled/@next/font";

export type FaceLoader = () => Promise<{ default: NextFontWithVariable }>;

export const FACE_LOADERS = {
  "urbanist:compact": () => import("./faces/urbanist-compact"),
  "urbanist:standard": () => import("./faces/urbanist-standard"),
  "inter:compact": () => import("./faces/inter-compact"),
  "inter:standard": () => import("./faces/inter-standard"),
  "roboto:compact": () => import("./faces/roboto-compact"),
  "roboto:standard": () => import("./faces/roboto-standard"),
  "open-sans:compact": () => import("./faces/open-sans-compact"),
  "open-sans:standard": () => import("./faces/open-sans-standard"),
  "montserrat:compact": () => import("./faces/montserrat-compact"),
  "montserrat:standard": () => import("./faces/montserrat-standard"),
  "playfair:compact": () => import("./faces/playfair-compact"),
  "playfair:standard": () => import("./faces/playfair-standard"),
  "raleway:compact": () => import("./faces/raleway-compact"),
  "raleway:standard": () => import("./faces/raleway-standard"),
  "nunito:compact": () => import("./faces/nunito-compact"),
  "nunito:standard": () => import("./faces/nunito-standard"),
  "source-sans:compact": () => import("./faces/source-sans-compact"),
  "source-sans:standard": () => import("./faces/source-sans-standard"),
  "dm-sans:compact": () => import("./faces/dm-sans-compact"),
  "dm-sans:standard": () => import("./faces/dm-sans-standard"),
  "space-grotesk:compact": () => import("./faces/space-grotesk-compact"),
  "space-grotesk:standard": () => import("./faces/space-grotesk-standard"),
  "instrument-sans:compact": () => import("./faces/instrument-sans-compact"),
  "instrument-sans:standard": () => import("./faces/instrument-sans-standard"),
  lato: () => import("./faces/lato"),
  poppins: () => import("./faces/poppins"),
  merriweather: () => import("./faces/merriweather"),
} as const satisfies Record<string, FaceLoader>;

export type FaceKey = keyof typeof FACE_LOADERS;
