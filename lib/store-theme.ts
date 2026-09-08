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

/** Product-tag names/slugs that render as card/PDP pills. */
export interface CatalogTheme {
  badgeTags?: string[];
  /** Ordered collection slugs on the homepage category carousel. Omit = first N. */
  homepageCollections?: string[];
  /** Ordered collection slugs on the Shop header carousel. Omit = all roots. */
  shopCollections?: string[];
}

/** Optional override for one SectionHeader (omit = starter hardcoded copy). */
export interface SectionCopyFields {
  title?: string;
  eyebrow?: string;
  allButton?: string;
  allButtonPath?: string;
}

/**
 * Customer-owned section strings. Starter omits this — hardcoded titles stay.
 * `{word}` in title uses the heading highlight face (same as product names).
 */
export interface CopyTheme {
  homepageFeatured?: SectionCopyFields;
  pdpBundles?: SectionCopyFields;
  pdpRelated?: SectionCopyFields;
  /** Link text under a homepage collection-card title. Omit = title only. */
  collectionCardLink?: string;
}

/** Optional PDP chrome owned by the customer theme. */
export interface PdpTheme {
  /**
   * Internal path for a Size Guide CMS page (e.g. `/size-guide`).
   * The PDP opens that page's HTML in the size-guide modal. Direct
   * visits to the path still render the full CMS page. Does not
   * disable the modal when a product also has `sizeChart`.
   */
  sizeGuideHref?: string;
}

/** Validated customer theme from overrides/theme.json. */
export interface StoreTheme {
  version: number;
  layout: {
    navLayout: NavLayout;
    navStyle: NavStyle;
    heroLayout: HeroLayout;
    homepageNav: HomepageNav;
    /** Shopify PDP “Enquire about this product”. Default true; Velvet sets false. */
    productEnquiry: boolean;
  };
  catalog?: CatalogTheme;
  pdp?: PdpTheme;
  copy?: CopyTheme;
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
  productEnquiry: z.boolean().default(true),
});

const collectionSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/);

const catalogSchema = z.object({
  badgeTags: z.array(z.string().min(1).max(64)).max(32).optional(),
  homepageCollections: z.array(collectionSlugSchema).max(32).optional(),
  shopCollections: z.array(collectionSlugSchema).max(32).optional(),
});

const pdpSchema = z.object({
  sizeGuideHref: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/),
});

const sectionCopySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  eyebrow: z.string().max(200).optional(),
  allButton: z.string().max(80).optional(),
  allButtonPath: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/)
    .optional(),
});

const copySchema = z.object({
  homepageFeatured: sectionCopySchema.optional(),
  pdpBundles: sectionCopySchema.optional(),
  pdpRelated: sectionCopySchema.optional(),
  collectionCardLink: z.string().min(1).max(80).optional(),
});

const themeSchema = z.object({
  version: z.number().int().min(1),
  layout: layoutSchema,
  catalog: catalogSchema.optional(),
  pdp: pdpSchema.optional(),
  copy: copySchema.optional(),
  figma: z
    .object({
      fileKey: z.string(),
      referenceFrames: z.record(z.string(), z.string()),
    })
    .optional(),
});

function pickSectionCopy(
  fields: z.infer<typeof sectionCopySchema>,
): SectionCopyFields {
  const picked: SectionCopyFields = {};
  if (fields.title !== undefined) {
    picked.title = fields.title;
  }
  if (fields.eyebrow !== undefined) {
    picked.eyebrow = fields.eyebrow;
  }
  if (fields.allButton !== undefined) {
    picked.allButton = fields.allButton;
  }
  if (fields.allButtonPath !== undefined) {
    picked.allButtonPath = fields.allButtonPath;
  }
  return picked;
}

const STARTER_DEFAULTS: StoreTheme = {
  version: 1,
  layout: {
    navLayout: "left-logo",
    navStyle: "icons",
    heroLayout: "inset",
    homepageNav: "solid",
    productEnquiry: true,
  },
};

let cachedTheme: StoreTheme | null = null;

function normalizeTheme(data: z.infer<typeof themeSchema>): StoreTheme {
  const theme: StoreTheme = {
    version: data.version,
    layout: data.layout,
  };
  if (data.catalog !== undefined) {
    const catalog: CatalogTheme = {};
    if (data.catalog.badgeTags !== undefined) {
      catalog.badgeTags = data.catalog.badgeTags;
    }
    if (data.catalog.homepageCollections !== undefined) {
      catalog.homepageCollections = data.catalog.homepageCollections;
    }
    if (data.catalog.shopCollections !== undefined) {
      catalog.shopCollections = data.catalog.shopCollections;
    }
    theme.catalog = catalog;
  }
  if (data.pdp !== undefined) {
    theme.pdp = data.pdp;
  }
  if (data.copy !== undefined) {
    const copy: CopyTheme = {};
    if (data.copy.homepageFeatured !== undefined) {
      copy.homepageFeatured = pickSectionCopy(data.copy.homepageFeatured);
    }
    if (data.copy.pdpBundles !== undefined) {
      copy.pdpBundles = pickSectionCopy(data.copy.pdpBundles);
    }
    if (data.copy.pdpRelated !== undefined) {
      copy.pdpRelated = pickSectionCopy(data.copy.pdpRelated);
    }
    if (data.copy.collectionCardLink !== undefined) {
      copy.collectionCardLink = data.copy.collectionCardLink;
    }
    theme.copy = copy;
  }
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
  const base = "relative aspect-square w-full overflow-hidden md:aspect-video";
  if (heroLayout === "fixed-height") {
    return `${base} md:aspect-auto md:h-[850px] md:max-h-none`;
  }
  if (heroLayout === "full-bleed") {
    return `${base} md:max-h-[85svh]`;
  }
  return `${base} md:max-h-[70svh]`;
}
