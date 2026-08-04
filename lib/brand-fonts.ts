/**
 * Curated Google Fonts via next/font/google for storefront branding.
 *
 * Only fonts selected in the dashboard that map to this list are shipped
 * (self-hosted by Next.js). Unknown Google families fall back to Urbanist —
 * no remote `fonts.googleapis.com` stylesheets. Uploads use @font-face.
 */

import {
  Urbanist,
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Montserrat,
  Poppins,
  Playfair_Display,
  Merriweather,
  Raleway,
  Nunito,
  Source_Sans_3,
  DM_Sans,
  Space_Grotesk,
  Instrument_Sans,
} from "next/font/google";
import type { NextFontWithVariable } from "next/dist/compiled/@next/font";

type CuratedFont = {
  font: NextFontWithVariable;
  cssVar: string;
};

const urbanist = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-urbanist",
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-inter",
});
const roboto = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-roboto",
});
const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-open-sans",
});
const lato = Lato({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-lato",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-montserrat",
});
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-poppins",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-playfair",
});
const merriweather = Merriweather({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-merriweather",
});
const raleway = Raleway({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-raleway",
});
const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-nunito",
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-source-sans",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-dm-sans",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-space-grotesk",
});
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-instrument-sans",
});

/** Default storefront body font (Urbanist). */
export const defaultBodyFont = urbanist;

const CURATED: Record<string, CuratedFont> = {
  Urbanist: { font: urbanist, cssVar: "--font-slot-urbanist" },
  Inter: { font: inter, cssVar: "--font-slot-inter" },
  Roboto: { font: roboto, cssVar: "--font-slot-roboto" },
  "Open Sans": { font: openSans, cssVar: "--font-slot-open-sans" },
  "Open+Sans": { font: openSans, cssVar: "--font-slot-open-sans" },
  Lato: { font: lato, cssVar: "--font-slot-lato" },
  Montserrat: { font: montserrat, cssVar: "--font-slot-montserrat" },
  Poppins: { font: poppins, cssVar: "--font-slot-poppins" },
  "Playfair Display": { font: playfair, cssVar: "--font-slot-playfair" },
  "Playfair+Display": { font: playfair, cssVar: "--font-slot-playfair" },
  Merriweather: { font: merriweather, cssVar: "--font-slot-merriweather" },
  Raleway: { font: raleway, cssVar: "--font-slot-raleway" },
  Nunito: { font: nunito, cssVar: "--font-slot-nunito" },
  "Source Sans 3": { font: sourceSans, cssVar: "--font-slot-source-sans" },
  "Source+Sans+3": { font: sourceSans, cssVar: "--font-slot-source-sans" },
  "DM Sans": { font: dmSans, cssVar: "--font-slot-dm-sans" },
  "DM+Sans": { font: dmSans, cssVar: "--font-slot-dm-sans" },
  "Space Grotesk": { font: spaceGrotesk, cssVar: "--font-slot-space-grotesk" },
  "Space+Grotesk": { font: spaceGrotesk, cssVar: "--font-slot-space-grotesk" },
  "Instrument Sans": {
    font: instrumentSans,
    cssVar: "--font-slot-instrument-sans",
  },
  "Instrument+Sans": {
    font: instrumentSans,
    cssVar: "--font-slot-instrument-sans",
  },
};

export type BrandingFontInput = {
  source: string;
  family: string;
  googleSlug: string;
  fileUrl: string;
};

export type ResolvedBrandFonts = {
  /** Classes that define next/font CSS variables (apply on <html>). */
  variableClassNames: string;
  /** className for <body> (primary body font metrics). */
  bodyClassName: string;
  /** Inline CSS assigning --font-heading / --font-subheading / --font-body. */
  cssVars: string;
  /** Extra <style> for @font-face uploads. */
  fontFaceCss: string;
};

function pickCurated(font: BrandingFontInput): CuratedFont | null {
  if (font.source === "upload") return null;
  for (const key of [font.googleSlug, font.family]) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const hit = CURATED[trimmed];
    if (hit) return hit;
  }
  return null;
}

function cssFamilyLiteral(family: string): string {
  const trimmed = family.trim() || "sans-serif";
  return trimmed.includes(" ") ? `"${trimmed}"` : trimmed;
}

function fontFormat(url: string): string | null {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".woff2")) return "woff2";
  if (clean.endsWith(".woff")) return "woff";
  if (clean.endsWith(".ttf")) return "truetype";
  if (clean.endsWith(".otf")) return "opentype";
  return null;
}

/**
 * Resolve heading / subheading / body fonts from branding into next/font
 * classes, CSS variables, and upload @font-face rules.
 *
 * Non-curated Google selections fall back to Urbanist (no remote CSS).
 */
export function resolveBrandFonts(input: {
  heading: BrandingFontInput;
  subheading: BrandingFontInput;
  body: BrandingFontInput;
}): ResolvedBrandFonts {
  const slots = {
    heading: input.heading,
    subheading: input.subheading,
    body: input.body,
  } as const;

  const curatedBySlot: Record<keyof typeof slots, CuratedFont | null> = {
    heading: pickCurated(slots.heading),
    subheading: pickCurated(slots.subheading),
    body: pickCurated(slots.body),
  };

  // Only ship Urbanist's next/font CSS when a slot actually needs it (curated
  // Urbanist, or fallback when a slot has no curated/upload source — including
  // unknown Google families that used to load via fonts.googleapis.com).
  // Always-including it forced an unused webfont download + swap CLS (ENG-856).
  const needsUrbanistFallback = (
    Object.keys(slots) as Array<keyof typeof slots>
  ).some((slot) => {
    const font = slots[slot];
    if (curatedBySlot[slot]) return false;
    if (font.source === "upload" && font.fileUrl) return false;
    return true;
  });

  const unique = new Map<string, CuratedFont>();
  if (needsUrbanistFallback) {
    unique.set(urbanist.variable, {
      font: urbanist,
      cssVar: "--font-slot-urbanist",
    });
  }
  for (const entry of Object.values(curatedBySlot)) {
    if (entry) unique.set(entry.font.variable, entry);
  }

  const variableClassNames = [...unique.values()]
    .map((entry) => entry.font.variable)
    .join(" ");

  const bodyFont = curatedBySlot.body?.font ?? urbanist;

  const cssVarLines: string[] = [];
  const fontFaceParts: string[] = [];

  (Object.keys(slots) as Array<keyof typeof slots>).forEach((slot) => {
    const font = slots[slot];
    const cssVar = `--font-${slot}`;
    const curated = curatedBySlot[slot];

    if (font.source === "upload" && font.fileUrl) {
      const family = cssFamilyLiteral(font.family || "CustomBrand");
      const format = fontFormat(font.fileUrl);
      fontFaceParts.push(
        `@font-face{font-family:${family};src:url(${JSON.stringify(font.fileUrl)})${format ? ` format(${JSON.stringify(format)})` : ""};font-display:swap;}`,
      );
      cssVarLines.push(`${cssVar}: ${family}, sans-serif;`);
      return;
    }

    if (curated) {
      cssVarLines.push(`${cssVar}: var(${curated.cssVar});`);
      return;
    }

    // Unknown Google family or empty slot → Urbanist via next/font only.
    cssVarLines.push(`${cssVar}: var(--font-slot-urbanist);`);
  });

  return {
    variableClassNames,
    bodyClassName: bodyFont.className,
    cssVars: cssVarLines.join(" "),
    fontFaceCss: fontFaceParts.join(""),
  };
}
