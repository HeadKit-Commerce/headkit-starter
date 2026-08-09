/**
 * Curated Google Fonts via next/font/google for storefront branding.
 *
 * Only fonts selected in the dashboard that map to this list are shipped
 * (self-hosted by Next.js). Unknown Google families fall back to Urbanist —
 * no remote `fonts.googleapis.com` stylesheets. Uploads use @font-face.
 *
 * Each family/variant lives in `lib/brand-fonts/faces/*` and is loaded via
 * dynamic `import()` so unused faces never enter the CSS graph. The previous
 * monolithic module evaluated every next/font loader at once and injected
 * ~80 woff2 `@font-face` rules into every page CSS (LCP / FCP killer).
 *
 * IMPORTANT: next/font loaders must be called with literal options and assigned
 * to a module-scope `const` inside each face file — never wrapped in helpers.
 */

import type { NextFontWithVariable } from "next/dist/compiled/@next/font";
import { toSameOriginBrandFontUrl } from "@/lib/brand-font-url";
import { FACE_LOADERS, type FaceKey } from "@/lib/brand-fonts/face-loaders";

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

type CuratedFamilySpec =
  | { kind: "fixed"; face: FaceKey; cssVar: CssVarName; weights: readonly FontWeight[] }
  | {
      kind: "variants";
      cssVar: CssVarName;
      faces: Record<WeightVariant, FaceKey>;
    };

const CURATED: Record<string, CuratedFamilySpec> = {
  Urbanist: {
    kind: "variants",
    cssVar: "--font-slot-urbanist",
    faces: { compact: "urbanist:compact", standard: "urbanist:standard" },
  },
  Inter: {
    kind: "variants",
    cssVar: "--font-slot-inter",
    faces: { compact: "inter:compact", standard: "inter:standard" },
  },
  Roboto: {
    kind: "variants",
    cssVar: "--font-slot-roboto",
    faces: { compact: "roboto:compact", standard: "roboto:standard" },
  },
  "Open Sans": {
    kind: "variants",
    cssVar: "--font-slot-open-sans",
    faces: { compact: "open-sans:compact", standard: "open-sans:standard" },
  },
  "Open+Sans": {
    kind: "variants",
    cssVar: "--font-slot-open-sans",
    faces: { compact: "open-sans:compact", standard: "open-sans:standard" },
  },
  Lato: {
    kind: "fixed",
    face: "lato",
    cssVar: "--font-slot-lato",
    weights: ["400", "700"],
  },
  Montserrat: {
    kind: "variants",
    cssVar: "--font-slot-montserrat",
    faces: { compact: "montserrat:compact", standard: "montserrat:standard" },
  },
  Poppins: {
    kind: "fixed",
    face: "poppins",
    cssVar: "--font-slot-poppins",
    weights: STANDARD_WEIGHTS,
  },
  "Playfair Display": {
    kind: "variants",
    cssVar: "--font-slot-playfair",
    faces: { compact: "playfair:compact", standard: "playfair:standard" },
  },
  "Playfair+Display": {
    kind: "variants",
    cssVar: "--font-slot-playfair",
    faces: { compact: "playfair:compact", standard: "playfair:standard" },
  },
  Merriweather: {
    kind: "fixed",
    face: "merriweather",
    cssVar: "--font-slot-merriweather",
    weights: ["400", "700"],
  },
  Raleway: {
    kind: "variants",
    cssVar: "--font-slot-raleway",
    faces: { compact: "raleway:compact", standard: "raleway:standard" },
  },
  Nunito: {
    kind: "variants",
    cssVar: "--font-slot-nunito",
    faces: { compact: "nunito:compact", standard: "nunito:standard" },
  },
  "Source Sans 3": {
    kind: "variants",
    cssVar: "--font-slot-source-sans",
    faces: { compact: "source-sans:compact", standard: "source-sans:standard" },
  },
  "Source+Sans+3": {
    kind: "variants",
    cssVar: "--font-slot-source-sans",
    faces: { compact: "source-sans:compact", standard: "source-sans:standard" },
  },
  "DM Sans": {
    kind: "variants",
    cssVar: "--font-slot-dm-sans",
    faces: { compact: "dm-sans:compact", standard: "dm-sans:standard" },
  },
  "DM+Sans": {
    kind: "variants",
    cssVar: "--font-slot-dm-sans",
    faces: { compact: "dm-sans:compact", standard: "dm-sans:standard" },
  },
  "Space Grotesk": {
    kind: "variants",
    cssVar: "--font-slot-space-grotesk",
    faces: {
      compact: "space-grotesk:compact",
      standard: "space-grotesk:standard",
    },
  },
  "Space+Grotesk": {
    kind: "variants",
    cssVar: "--font-slot-space-grotesk",
    faces: {
      compact: "space-grotesk:compact",
      standard: "space-grotesk:standard",
    },
  },
  "Instrument Sans": {
    kind: "variants",
    cssVar: "--font-slot-instrument-sans",
    faces: {
      compact: "instrument-sans:compact",
      standard: "instrument-sans:standard",
    },
  },
  "Instrument+Sans": {
    kind: "variants",
    cssVar: "--font-slot-instrument-sans",
    faces: {
      compact: "instrument-sans:compact",
      standard: "instrument-sans:standard",
    },
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

function lookupFamily(font: BrandingFontInput): CuratedFamilySpec | null {
  if (font.source === "upload") return null;
  for (const key of [font.googleSlug, font.family]) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const family = CURATED[trimmed];
    if (family) return family;
  }
  return null;
}

function faceKeyFor(font: BrandingFontInput): FaceKey | null {
  const family = lookupFamily(font);
  if (!family) return null;
  if (family.kind === "fixed") return family.face;
  const weights = normalizeGoogleWeights(font.googleWeights);
  return family.faces[pickVariant(weights)];
}

async function loadFace(key: FaceKey): Promise<CuratedFont> {
  const mod = await FACE_LOADERS[key]();
  const font = mod.default;
  // cssVar is on the font.variable string like `--font-slot-inter`
  const cssVar = font.variable as CssVarName;
  const weights =
    key.endsWith(":standard") || key === "poppins"
      ? STANDARD_WEIGHTS
      : key === "lato" || key === "merriweather"
        ? (["400", "700"] as const)
        : COMPACT_WEIGHTS;
  return { font, cssVar, weights };
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
 * Only the face modules required for this tenant are dynamically imported.
 */
export async function resolveBrandFonts(input: {
  heading: BrandingFontInput;
  subheading: BrandingFontInput;
  body: BrandingFontInput;
}): Promise<ResolvedBrandFonts> {
  const slots = {
    heading: input.heading,
    subheading: input.subheading,
    body: input.body,
  } as const;

  const faceKeyBySlot: Record<keyof typeof slots, FaceKey | null> = {
    heading: faceKeyFor(slots.heading),
    subheading: faceKeyFor(slots.subheading),
    body: faceKeyFor(slots.body),
  };

  // Only ship Urbanist's next/font CSS when a slot actually needs it (curated
  // Urbanist, or fallback when a slot has no curated/upload source — including
  // unknown Google families that used to load via fonts.googleapis.com).
  const needsUrbanistFallback = (
    Object.keys(slots) as Array<keyof typeof slots>
  ).some((slot) => {
    const font = slots[slot];
    if (faceKeyBySlot[slot]) return false;
    if (font.source === "upload" && font.fileUrl) return false;
    return true;
  });

  const keysToLoad = new Set<FaceKey>();
  if (needsUrbanistFallback) {
    keysToLoad.add("urbanist:compact");
  }
  for (const key of Object.values(faceKeyBySlot)) {
    if (key) keysToLoad.add(key);
  }

  const loaded = new Map<FaceKey, CuratedFont>();
  await Promise.all(
    [...keysToLoad].map(async (key) => {
      loaded.set(key, await loadFace(key));
    }),
  );

  const curatedBySlot: Record<keyof typeof slots, CuratedFont | null> = {
    heading: faceKeyBySlot.heading
      ? (loaded.get(faceKeyBySlot.heading) ?? null)
      : null,
    subheading: faceKeyBySlot.subheading
      ? (loaded.get(faceKeyBySlot.subheading) ?? null)
      : null,
    body: faceKeyBySlot.body ? (loaded.get(faceKeyBySlot.body) ?? null) : null,
  };

  // Deduplicate by CSS variable so shared heading/body families ship once.
  const unique = new Map<string, CuratedFont>();
  if (needsUrbanistFallback) {
    const urbanist = loaded.get("urbanist:compact");
    if (urbanist) unique.set(urbanist.font.variable, urbanist);
  }
  for (const entryFont of Object.values(curatedBySlot)) {
    if (entryFont) unique.set(entryFont.font.variable, entryFont);
  }

  const variableClassNames = [...unique.values()]
    .map((curated) => curated.font.variable)
    .join(" ");

  const bodyFont =
    curatedBySlot.body?.font ??
    loaded.get("urbanist:compact")?.font ??
    // Absolute last resort — should be unreachable when fallback loads.
    ({ className: "", variable: "--font-slot-urbanist" } as NextFontWithVariable);

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
