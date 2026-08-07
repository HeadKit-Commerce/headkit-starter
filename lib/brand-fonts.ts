/**
 * Curated Google Fonts via next/font/google for storefront branding.
 *
 * Only fonts selected in the dashboard that map to this list are shipped
 * (self-hosted by Next.js). Unknown Google families fall back to Urbanist —
 * no remote `fonts.googleapis.com` stylesheets. Uploads use @font-face.
 *
 * Variable fonts always declare discrete `weight` arrays so next/font ships
 * static faces instead of the full variable axis set (was ~19 files / 600KB+).
 * Dashboard `googleWeights` pick the leanest prebuilt variant that covers them.
 *
 * IMPORTANT: next/font loaders must be called with literal options and assigned
 * to a module-scope `const`. Do not wrap loaders in helpers — the bundler
 * rejects that with "Font loaders must be called and assigned to a const in
 * the module scope".
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
import { toSameOriginBrandFontUrl } from "@/lib/brand-font-url";

type FontWeight = "400" | "500" | "600" | "700";

/** next/font requires CSS variables to be `` `--${string}` ``. */
type CssVarName = `--${string}`;

type CuratedFont = {
  font: NextFontWithVariable;
  cssVar: CssVarName;
  /** Discrete weights included in this next/font instance. */
  weights: readonly FontWeight[];
};

/** Default lean set: Regular / Medium / SemiBold (covers most storefront UI). */
export const DEFAULT_GOOGLE_WEIGHTS: readonly number[] = [400, 500, 600];

/** Available weight checkboxes in the dashboard. */
export const GOOGLE_FONT_WEIGHT_OPTIONS: readonly {
  value: number;
  label: string;
}[] = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semi-Bold" },
  { value: 700, label: "Bold" },
];

/** Compact = 400/500/600; standard adds 700 for bold UI. */
type WeightVariant = "compact" | "standard";

const COMPACT_WEIGHTS = ["400", "500", "600"] as const satisfies FontWeight[];
const STANDARD_WEIGHTS = [
  "400",
  "500",
  "600",
  "700",
] as const satisfies FontWeight[];

function entry(
  font: NextFontWithVariable,
  cssVar: CssVarName,
  weights: readonly FontWeight[],
): CuratedFont {
  return { font, cssVar, weights };
}

function pair(
  compact: NextFontWithVariable,
  standard: NextFontWithVariable,
  cssVar: CssVarName,
): Record<WeightVariant, CuratedFont> {
  return {
    compact: entry(compact, cssVar, COMPACT_WEIGHTS),
    standard: entry(standard, cssVar, STANDARD_WEIGHTS),
  };
}

// --- next/font calls (must stay module-scope literals) --------------------

const urbanistCompact = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-urbanist",
  weight: ["400", "500", "600"],
});
const urbanistStandard = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-urbanist",
  weight: ["400", "500", "600", "700"],
});

const interCompact = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-inter",
  weight: ["400", "500", "600"],
});
const interStandard = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-inter",
  weight: ["400", "500", "600", "700"],
});

const robotoCompact = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-roboto",
  weight: ["400", "500", "600"],
});
const robotoStandard = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-roboto",
  weight: ["400", "500", "600", "700"],
});

const openSansCompact = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-open-sans",
  weight: ["400", "500", "600"],
});
const openSansStandard = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-open-sans",
  weight: ["400", "500", "600", "700"],
});

const montserratCompact = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-montserrat",
  weight: ["400", "500", "600"],
});
const montserratStandard = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-montserrat",
  weight: ["400", "500", "600", "700"],
});

const playfairCompact = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-playfair",
  weight: ["400", "500", "600"],
});
const playfairStandard = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-playfair",
  weight: ["400", "500", "600", "700"],
});

const ralewayCompact = Raleway({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-raleway",
  weight: ["400", "500", "600"],
});
const ralewayStandard = Raleway({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-raleway",
  weight: ["400", "500", "600", "700"],
});

const nunitoCompact = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-nunito",
  weight: ["400", "500", "600"],
});
const nunitoStandard = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-nunito",
  weight: ["400", "500", "600", "700"],
});

const sourceSansCompact = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-source-sans",
  weight: ["400", "500", "600"],
});
const sourceSansStandard = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-source-sans",
  weight: ["400", "500", "600", "700"],
});

const dmSansCompact = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-dm-sans",
  weight: ["400", "500", "600"],
});
const dmSansStandard = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const spaceGroteskCompact = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-space-grotesk",
  weight: ["400", "500", "600"],
});
const spaceGroteskStandard = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

const instrumentSansCompact = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-instrument-sans",
  weight: ["400", "500", "600"],
});
const instrumentSansStandard = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-instrument-sans",
  weight: ["400", "500", "600", "700"],
});

// Non-variable / limited-weight families (fixed slots).
const latoFont = Lato({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-lato",
  weight: ["400", "700"],
});
const poppinsFont = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-poppins",
  weight: ["400", "500", "600", "700"],
});
const merriweatherFont = Merriweather({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-slot-merriweather",
  weight: ["400", "700"],
});

const urbanist = pair(
  urbanistCompact,
  urbanistStandard,
  "--font-slot-urbanist",
);
const inter = pair(interCompact, interStandard, "--font-slot-inter");
const roboto = pair(robotoCompact, robotoStandard, "--font-slot-roboto");
const openSans = pair(
  openSansCompact,
  openSansStandard,
  "--font-slot-open-sans",
);
const montserrat = pair(
  montserratCompact,
  montserratStandard,
  "--font-slot-montserrat",
);
const playfair = pair(
  playfairCompact,
  playfairStandard,
  "--font-slot-playfair",
);
const raleway = pair(ralewayCompact, ralewayStandard, "--font-slot-raleway");
const nunito = pair(nunitoCompact, nunitoStandard, "--font-slot-nunito");
const sourceSans = pair(
  sourceSansCompact,
  sourceSansStandard,
  "--font-slot-source-sans",
);
const dmSans = pair(dmSansCompact, dmSansStandard, "--font-slot-dm-sans");
const spaceGrotesk = pair(
  spaceGroteskCompact,
  spaceGroteskStandard,
  "--font-slot-space-grotesk",
);
const instrumentSans = pair(
  instrumentSansCompact,
  instrumentSansStandard,
  "--font-slot-instrument-sans",
);

const lato = entry(latoFont, "--font-slot-lato", ["400", "700"]);
const poppins = entry(poppinsFont, "--font-slot-poppins", STANDARD_WEIGHTS);
const merriweather = entry(merriweatherFont, "--font-slot-merriweather", [
  "400",
  "700",
]);

/** Default storefront body font (Urbanist compact). */
export const defaultBodyFont = urbanist.compact.font;

type CuratedFamily = {
  fixed?: CuratedFont;
  variants?: Record<WeightVariant, CuratedFont>;
};

const CURATED: Record<string, CuratedFamily> = {
  Urbanist: { variants: urbanist },
  Inter: { variants: inter },
  Roboto: { variants: roboto },
  "Open Sans": { variants: openSans },
  "Open+Sans": { variants: openSans },
  Lato: { fixed: lato },
  Montserrat: { variants: montserrat },
  Poppins: { fixed: poppins },
  "Playfair Display": { variants: playfair },
  "Playfair+Display": { variants: playfair },
  Merriweather: { fixed: merriweather },
  Raleway: { variants: raleway },
  Nunito: { variants: nunito },
  "Source Sans 3": { variants: sourceSans },
  "Source+Sans+3": { variants: sourceSans },
  "DM Sans": { variants: dmSans },
  "DM+Sans": { variants: dmSans },
  "Space Grotesk": { variants: spaceGrotesk },
  "Space+Grotesk": { variants: spaceGrotesk },
  "Instrument Sans": { variants: instrumentSans },
  "Instrument+Sans": { variants: instrumentSans },
};

export type BrandingFontInput = {
  source: string;
  family: string;
  googleSlug: string;
  fileUrl: string;
  /** Discrete Google weights to load; empty → DEFAULT_GOOGLE_WEIGHTS. */
  googleWeights?: number[];
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

/**
 * Normalize dashboard weight selections into a sorted unique list of
 * 400/500/600/700. Empty input → default lean set.
 */
export function normalizeGoogleWeights(
  weights: number[] | null | undefined,
): number[] {
  if (!weights || weights.length === 0) {
    return [...DEFAULT_GOOGLE_WEIGHTS];
  }
  const allowed = new Set([400, 500, 600, 700]);
  const unique = [...new Set(weights.filter((w) => allowed.has(w)))].toSorted(
    (a, b) => a - b,
  );
  return unique.length > 0 ? unique : [...DEFAULT_GOOGLE_WEIGHTS];
}

function pickVariant(requested: number[]): WeightVariant {
  // Need 700 → standard; otherwise compact covers Regular/Medium/SemiBold.
  return requested.includes(700) ? "standard" : "compact";
}

function pickCurated(font: BrandingFontInput): CuratedFont | null {
  if (font.source === "upload") return null;
  let family: CuratedFamily | undefined;
  for (const key of [font.googleSlug, font.family]) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    family = CURATED[trimmed];
    if (family) break;
  }
  if (!family) return null;
  if (family.fixed) return family.fixed;
  if (!family.variants) return null;
  const weights = normalizeGoogleWeights(font.googleWeights);
  return family.variants[pickVariant(weights)];
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
    unique.set(urbanist.compact.font.variable, urbanist.compact);
  }
  for (const entryFont of Object.values(curatedBySlot)) {
    if (entryFont) unique.set(entryFont.font.variable, entryFont);
  }

  const variableClassNames = [...unique.values()]
    .map((curated) => curated.font.variable)
    .join(" ");

  const bodyFont = curatedBySlot.body?.font ?? urbanist.compact.font;

  const cssVarLines: string[] = [];
  const fontFaceParts: string[] = [];

  (Object.keys(slots) as Array<keyof typeof slots>).forEach((slot) => {
    const font = slots[slot];
    const cssVar = `--font-${slot}`;
    const curated = curatedBySlot[slot];

    if (font.source === "upload" && font.fileUrl) {
      const family = cssFamilyLiteral(font.family || "CustomBrand");
      const srcUrl = toSameOriginBrandFontUrl(font.fileUrl);
      const format = fontFormat(font.fileUrl);
      fontFaceParts.push(
        `@font-face{font-family:${family};src:url(${JSON.stringify(srcUrl)})${format ? ` format(${JSON.stringify(format)})` : ""};font-weight:100 900;font-style:normal;font-display:swap;}`,
      );
      cssVarLines.push(`${cssVar}: ${family}, sans-serif;`);
      return;
    }

    if (curated) {
      cssVarLines.push(`${cssVar}: var(${curated.cssVar});`);
      return;
    }

    cssVarLines.push(`${cssVar}: var(--font-slot-urbanist);`);
  });

  return {
    variableClassNames,
    bodyClassName: bodyFont.className,
    cssVars: cssVarLines.join(" "),
    fontFaceCss: fontFaceParts.join(""),
  };
}
