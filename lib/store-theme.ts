import { z } from "zod";
import themeJson from "@/overrides/theme.json";

/** Supported nav logo placements — see overrides/theme.schema.json. */
export type NavLayout = "left-logo" | "centered-logo" | "split";

/** Desktop header action presentation. */
export type NavStyle = "icons" | "text-labels";

/** Hero carousel shell variants. */
export type HeroLayout = "inset" | "full-bleed" | "fixed-height";

/** Homepage navigation chrome. */
export type HomepageNav = "solid" | "overlay-hero";

/** Validated customer theme from overrides/theme.json. */
export interface StoreTheme {
  version: number;
  layout: {
    navLayout: NavLayout;
    navStyle: NavStyle;
    heroLayout: HeroLayout;
    homepageNav: HomepageNav;
  };
  figma?: {
    fileKey: string;
    referenceFrames: Record<string, string>;
  };
}

const layoutSchema = z.object({
  navLayout: z.enum(["left-logo", "centered-logo", "split"]),
  navStyle: z.enum(["icons", "text-labels"]),
  heroLayout: z.enum(["inset", "full-bleed", "fixed-height"]),
  homepageNav: z.enum(["solid", "overlay-hero"]),
});

const themeSchema = z.object({
  version: z.number().int().min(1),
  layout: layoutSchema,
  figma: z
    .object({
      fileKey: z.string(),
      referenceFrames: z.record(z.string(), z.string()),
    })
    .optional(),
});

const STARTER_DEFAULTS: StoreTheme = {
  version: 1,
  layout: {
    navLayout: "left-logo",
    navStyle: "icons",
    heroLayout: "inset",
    homepageNav: "solid",
  },
};

let cachedTheme: StoreTheme | null = null;

function normalizeTheme(data: z.infer<typeof themeSchema>): StoreTheme {
  const theme: StoreTheme = {
    version: data.version,
    layout: data.layout,
  };
  if (data.figma !== undefined) {
    theme.figma = data.figma;
  }
  return theme;
}

/**
 * Load and validate overrides/theme.json. Invalid files fall back to starter
 * defaults so a typo cannot break the storefront shell.
 */
export function getStoreTheme(): StoreTheme {
  if (cachedTheme) {
    return cachedTheme;
  }
  const parsed = themeSchema.safeParse(themeJson);
  cachedTheme = parsed.success ? normalizeTheme(parsed.data) : STARTER_DEFAULTS;
  return cachedTheme;
}

/** Reset memoized theme — tests only. */
export function resetStoreThemeForTests(): void {
  cachedTheme = null;
}

/**
 * Map layout modes to `<html>` data attributes for SSR-safe CSS hooks.
 * Prefer these over per-route body classes — nav lives outside `<main>`.
 */
export function getThemeHtmlAttributes(
  theme: StoreTheme = getStoreTheme(),
): Record<string, string> {
  return {
    "data-nav-layout": theme.layout.navLayout,
    "data-nav-style": theme.layout.navStyle,
    "data-hero-layout": theme.layout.heroLayout,
    "data-homepage-nav": theme.layout.homepageNav,
  };
}

/** Tailwind-friendly class names for hero shell variants. */
export function heroLayoutClasses(heroLayout: HeroLayout): string {
  switch (heroLayout) {
    case "full-bleed":
      return "mx-0 rounded-none";
    case "fixed-height":
      return "mx-0 rounded-none";
    case "inset":
    default:
      return "mx-5";
  }
}

/** Inner media box classes for hero height modes. */
export function heroMediaClasses(heroLayout: HeroLayout): string {
  const base =
    "relative aspect-square w-full overflow-hidden md:aspect-video";
  if (heroLayout === "fixed-height") {
    return `${base} md:aspect-auto md:h-[850px] md:max-h-none`;
  }
  if (heroLayout === "full-bleed") {
    return `${base} md:max-h-[85svh]`;
  }
  return `${base} md:max-h-[70svh]`;
}
