/**
 * Curated brand fonts for the storefront.
 *
 * Selected Google families emit only their `@font-face` rules into the layout
 * `<style>` tag (latin woff2 from Fontsource on jsDelivr). Unused families
 * never appear in the CSS graph — unlike `next/font/google`, which previously
 * left ~27 font CSS chunks (~164KB / hundreds of `@font-face` rules) linked on
 * every page even when branding used a single family.
 *
 * Uploads keep using same-origin `@font-face` via `/api/branding-font`.
 * Unknown Google families fall back to Urbanist (no `fonts.googleapis.com`).
 */

import { toSameOriginBrandFontUrl } from "@/lib/brand-font-url";

type FontWeight = 400 | 500 | 600 | 700;

/** next/font-era CSS variable names kept for globals / tenant tokens. */
type CssVarName = `--${string}`;

/** Fontsource package id on jsDelivr (`cdn.jsdelivr.net/fontsource/fonts/{id}`). */
type FontsourceId = string;

type CuratedFamily = {
  cssVar: CssVarName;
  /** CSS `font-family` name (quoted when needed by callers). */
  familyName: string;
  fontsourceId: FontsourceId;
  /** Weights available for this family in our catalog. */
  availableWeights: readonly FontWeight[];
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

/** Pinned Fontsource release — bump intentionally when re-auditing faces. */
const FONTSOURCE_VERSION = "5.2.5";

const CURATED: Record<string, CuratedFamily> = {
  Urbanist: {
    cssVar: "--font-slot-urbanist",
    familyName: "Urbanist",
    fontsourceId: "urbanist",
    availableWeights: [400, 500, 600, 700],
  },
  Inter: {
    cssVar: "--font-slot-inter",
    familyName: "Inter",
    fontsourceId: "inter",
    availableWeights: [400, 500, 600, 700],
  },
  Roboto: {
    cssVar: "--font-slot-roboto",
    familyName: "Roboto",
    fontsourceId: "roboto",
    availableWeights: [400, 500, 600, 700],
  },
  "Open Sans": {
    cssVar: "--font-slot-open-sans",
    familyName: "Open Sans",
    fontsourceId: "open-sans",
    availableWeights: [400, 500, 600, 700],
  },
  "Open+Sans": {
    cssVar: "--font-slot-open-sans",
    familyName: "Open Sans",
    fontsourceId: "open-sans",
    availableWeights: [400, 500, 600, 700],
  },
  Lato: {
    cssVar: "--font-slot-lato",
    familyName: "Lato",
    fontsourceId: "lato",
    availableWeights: [400, 700],
  },
  Montserrat: {
    cssVar: "--font-slot-montserrat",
    familyName: "Montserrat",
    fontsourceId: "montserrat",
    availableWeights: [400, 500, 600, 700],
  },
  Poppins: {
    cssVar: "--font-slot-poppins",
    familyName: "Poppins",
    fontsourceId: "poppins",
    availableWeights: [400, 500, 600, 700],
  },
  "Playfair Display": {
    cssVar: "--font-slot-playfair",
    familyName: "Playfair Display",
    fontsourceId: "playfair-display",
    availableWeights: [400, 500, 600, 700],
  },
  "Playfair+Display": {
    cssVar: "--font-slot-playfair",
    familyName: "Playfair Display",
    fontsourceId: "playfair-display",
    availableWeights: [400, 500, 600, 700],
  },
  Merriweather: {
    cssVar: "--font-slot-merriweather",
    familyName: "Merriweather",
    fontsourceId: "merriweather",
    availableWeights: [400, 700],
  },
  Raleway: {
    cssVar: "--font-slot-raleway",
    familyName: "Raleway",
    fontsourceId: "raleway",
    availableWeights: [400, 500, 600, 700],
  },
  Nunito: {
    cssVar: "--font-slot-nunito",
    familyName: "Nunito",
    fontsourceId: "nunito",
    availableWeights: [400, 500, 600, 700],
  },
  "Source Sans 3": {
    cssVar: "--font-slot-source-sans",
    familyName: "Source Sans 3",
    fontsourceId: "source-sans-3",
    availableWeights: [400, 500, 600, 700],
  },
  "Source+Sans+3": {
    cssVar: "--font-slot-source-sans",
    familyName: "Source Sans 3",
    fontsourceId: "source-sans-3",
    availableWeights: [400, 500, 600, 700],
  },
  "DM Sans": {
    cssVar: "--font-slot-dm-sans",
    familyName: "DM Sans",
    fontsourceId: "dm-sans",
    availableWeights: [400, 500, 600, 700],
  },
  "DM+Sans": {
    cssVar: "--font-slot-dm-sans",
    familyName: "DM Sans",
    fontsourceId: "dm-sans",
    availableWeights: [400, 500, 600, 700],
  },
  "Space Grotesk": {
    cssVar: "--font-slot-space-grotesk",
    familyName: "Space Grotesk",
    fontsourceId: "space-grotesk",
    availableWeights: [400, 500, 600, 700],
  },
  "Space+Grotesk": {
    cssVar: "--font-slot-space-grotesk",
    familyName: "Space Grotesk",
    fontsourceId: "space-grotesk",
    availableWeights: [400, 500, 600, 700],
  },
  "Instrument Sans": {
    cssVar: "--font-slot-instrument-sans",
    familyName: "Instrument Sans",
    fontsourceId: "instrument-sans",
    availableWeights: [400, 500, 600, 700],
  },
  "Instrument+Sans": {
    cssVar: "--font-slot-instrument-sans",
    familyName: "Instrument Sans",
    fontsourceId: "instrument-sans",
    availableWeights: [400, 500, 600, 700],
  },
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
  /**
   * Reserved for compatibility — curated fonts no longer use next/font
   * variable classes (those pulled unused face CSS into every page).
   */
  variableClassNames: string;
  /** Unused by layout (variable classes + CSS vars are enough). */
  bodyClassName: string;
  /** Inline CSS assigning --font-heading / --font-subheading / --font-body + slots. */
  cssVars: string;
  /** Extra `<style>` for @font-face (curated + uploads). */
  fontFaceCss: string;
  /** True when curated faces load from Fontsource CDN (for preconnect). */
  usesFontsourceCdn: boolean;
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

function lookupFamily(font: BrandingFontInput): CuratedFamily | null {
  if (font.source === "upload") return null;
  for (const key of [font.googleSlug, font.family]) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const family = CURATED[trimmed];
    if (family) return family;
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

function fontsourceWoff2Url(id: FontsourceId, weight: FontWeight): string {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${id}@${FONTSOURCE_VERSION}/latin-${weight}-normal.woff2`;
}

function curatedFaceCss(
  family: CuratedFamily,
  requestedWeights: number[],
): string {
  const available = new Set<number>(family.availableWeights);
  const weights = requestedWeights.filter((w): w is FontWeight =>
    available.has(w),
  );
  const finalWeights =
    weights.length > 0
      ? weights
      : family.availableWeights.filter((w) =>
          DEFAULT_GOOGLE_WEIGHTS.includes(w),
        );
  const familyLiteral = cssFamilyLiteral(family.familyName);
  return finalWeights
    .map(
      (weight) =>
        `@font-face{font-family:${familyLiteral};font-style:normal;font-weight:${weight};font-display:swap;src:url(${JSON.stringify(fontsourceWoff2Url(family.fontsourceId, weight))}) format("woff2");}`,
    )
    .join("");
}

/**
 * Resolve heading / subheading / body fonts from branding into CSS variables
 * and `@font-face` rules. Only families actually selected for this tenant are
 * emitted — no unused curated catalog CSS.
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

  const curatedBySlot: Record<keyof typeof slots, CuratedFamily | null> = {
    heading: lookupFamily(slots.heading),
    subheading: lookupFamily(slots.subheading),
    body: lookupFamily(slots.body),
  };

  const needsUrbanistFallback = (
    Object.keys(slots) as Array<keyof typeof slots>
  ).some((slot) => {
    const font = slots[slot];
    if (curatedBySlot[slot]) return false;
    if (font.source === "upload" && font.fileUrl) return false;
    return true;
  });

  // Deduplicate curated families; merge weight requests across slots.
  const faces = new Map<
    CssVarName,
    { family: CuratedFamily; weights: Set<number> }
  >();

  const urbanist = CURATED.Urbanist;
  if (needsUrbanistFallback && urbanist) {
    faces.set(urbanist.cssVar, {
      family: urbanist,
      weights: new Set(DEFAULT_GOOGLE_WEIGHTS),
    });
  }

  (Object.keys(slots) as Array<keyof typeof slots>).forEach((slot) => {
    const curated = curatedBySlot[slot];
    if (!curated) return;
    const requested = normalizeGoogleWeights(slots[slot].googleWeights);
    const existing = faces.get(curated.cssVar);
    if (existing) {
      for (const w of requested) existing.weights.add(w);
      return;
    }
    faces.set(curated.cssVar, {
      family: curated,
      weights: new Set(requested),
    });
  });

  const fontFaceParts: string[] = [];
  const slotVarLines: string[] = [];

  for (const { family, weights } of faces.values()) {
    fontFaceParts.push(curatedFaceCss(family, [...weights].toSorted((a, b) => a - b)));
    slotVarLines.push(
      `${family.cssVar}: ${cssFamilyLiteral(family.familyName)}, ui-sans-serif, system-ui, sans-serif;`,
    );
  }

  const cssVarLines: string[] = [...slotVarLines];

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
    variableClassNames: "",
    bodyClassName: "",
    cssVars: cssVarLines.join(" "),
    fontFaceCss: fontFaceParts.join(""),
    usesFontsourceCdn: faces.size > 0,
  };
}
