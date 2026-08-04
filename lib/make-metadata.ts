import type { Metadata } from "next";
import type { SeoData } from "@headkit/sdk";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

/** WP / CMS titles that are not real SEO — fall through to dashboard / store name. */
const GENERIC_SEO_TITLES = new Set([
  "home",
  "homepage",
  "untitled",
  "auto draft",
  "auto-draft",
]);

export type SeoEntityType = "product" | "category" | "page";

/**
 * Optional SEO string under `exactOptionalPropertyTypes`.
 * Call sites often pass `x?.field` (`string | undefined`) or `x ?? null`.
 */
type OptSeoStr = string | null | undefined;

function stripTags(html?: OptSeoStr): string {
  return (html ?? "").replace(/<[^>]*>/g, "");
}

function normalizeUrl(url?: OptSeoStr): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return url;
}

/** True when a Yoast/CMS title is real SEO (not empty or a generic WP default). */
export function isRealSeoTitle(title?: OptSeoStr): boolean {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return false;
  return !GENERIC_SEO_TITLES.has(trimmed.toLowerCase());
}

/**
 * Resolve the store display name used in titles / fallbacks.
 * Never returns HeadKit marketing copy as a tenant default.
 */
export function resolveStoreName(storeName?: OptSeoStr): string {
  const trimmed = (storeName ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Store";
}

/**
 * Footer blurb: dashboard SEO description → else store name only.
 * Never falls back to HeadKit marketing copy.
 */
export function resolveFooterDescription(
  seoDescription?: OptSeoStr,
  storeName?: OptSeoStr,
): string {
  const desc = seoDescription?.trim();
  if (desc) return desc;
  return resolveStoreName(storeName);
}

/**
 * Home title hierarchy: real Yoast/WP title → dashboard SEO title → store name.
 * WP `"Home"` (and similar) is not real SEO.
 */
export function resolveHomeTitle(options: {
  yoastTitle?: OptSeoStr;
  dashboardTitle?: OptSeoStr;
  storeName?: OptSeoStr;
}): string {
  if (isRealSeoTitle(options.yoastTitle)) {
    return (options.yoastTitle ?? "").trim();
  }
  const dashboard = options.dashboardTitle?.trim();
  if (dashboard) return dashboard;
  return resolveStoreName(options.storeName);
}

/**
 * Home description hierarchy: Yoast metaDesc → dashboard description → empty
 * (layout/OG can still omit empty description; never HeadKit marketing copy).
 */
export function resolveHomeDescription(options: {
  yoastDescription?: OptSeoStr;
  dashboardDescription?: OptSeoStr;
}): string {
  const yoast = options.yoastDescription?.trim();
  if (yoast) return yoast;
  return options.dashboardDescription?.trim() ?? "";
}

/**
 * OG / Twitter image precedence:
 * Yoast entity image → dashboard `ogImageUrl` → branding icon → none.
 */
export function resolveOgImageUrl(options: {
  entityImageUrl?: OptSeoStr;
  dashboardOgImageUrl?: OptSeoStr;
  brandingIconUrl?: OptSeoStr;
}): string | undefined {
  return (
    normalizeUrl(options.entityImageUrl) ??
    normalizeUrl(options.dashboardOgImageUrl) ??
    normalizeUrl(options.brandingIconUrl)
  );
}

/** Production + store allowIndexing → index/follow; preview always noindex. */
export function resolveRobots(allowIndexing = true): Metadata["robots"] {
  const isProduction = process.env.VERCEL_ENV === "production";
  const index = isProduction && allowIndexing;
  return { index, follow: index };
}

/**
 * Templated per-entity SEO description fallback (FE-09 / D-04).
 *
 * When Yoast / SDK SEOData is absent, every entity route still needs a
 * non-empty, sensible description built from the entity name + store name.
 */
export function seoFallbackDescription(
  entityType: SeoEntityType,
  name: string,
  storeName?: OptSeoStr,
): string {
  const site = resolveStoreName(storeName);
  const trimmed = (name ?? "").trim();
  const label = trimmed.length > 0 ? trimmed : site;
  switch (entityType) {
    case "product":
      return `Shop ${label} at ${site}. View details, pricing, and availability.`;
    case "category":
      return `Browse ${label} at ${site}. Discover products in the ${label} collection.`;
    case "page":
      return `${label} — read more on ${site}.`;
  }
}

/**
 * Entity page title segment for the root `%s | {storeName}` template.
 * Returns the bare entity name (or store name when empty) — the layout
 * title template appends `| {storeName}`. Callers with a complete Yoast
 * title should pass it via {@link makeSeoMetadata}, which uses `absolute`.
 */
export function seoFallbackTitle(
  name?: OptSeoStr,
  storeName?: OptSeoStr,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length > 0) return trimmed;
  return resolveStoreName(storeName);
}

/** Build root (homepage / layout) metadata from optional overrides. */
export function makeRootMetadata(options?: {
  title?: OptSeoStr;
  description?: OptSeoStr;
  siteName?: OptSeoStr;
  /**
   * Per-store branding icon URL (ENG-572). Used for favicon via
   * {@link brandingIcons}; also OG/Twitter fallback when no dedicated OG image.
   */
  iconUrl?: OptSeoStr;
  /** Dashboard SEO OG image (takes precedence over branding icon for shares). */
  ogImageUrl?: OptSeoStr;
  /** Store-level “show on search engines” — default true. */
  allowIndexing?: boolean | undefined;
}): Metadata {
  const siteName = resolveStoreName(options?.siteName);
  const title = options?.title?.trim() || siteName;
  const description = stripTags(options?.description ?? "");
  const shareImage = resolveOgImageUrl({
    dashboardOgImageUrl: options?.ogImageUrl,
    brandingIconUrl: options?.iconUrl,
  });
  const allowIndexing = options?.allowIndexing !== false;
  const feedUrl = SITE_URL
    ? `${SITE_URL.replace(/\/$/, "")}/feed.xml`
    : "/feed.xml";

  // Single-locale storefront: no hreflang alternates. lang="en" is set on <html>.
  // If/when i18n ships, add alternates.languages here (and self + x-default).

  return {
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    applicationName: siteName,
    robots: resolveRobots(allowIndexing),
    alternates: {
      types: {
        "application/rss+xml": feedUrl,
      },
    },
    // NOTE: favicon `icons` are intentionally NOT set here — layout-only via
    // brandingIcons so page metadata cannot clobber the per-store tab icon.
    ...(shareImage
      ? {
          openGraph: {
            type: "website",
            title,
            description,
            siteName,
            images: [{ url: shareImage }],
          },
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [shareImage],
          },
        }
      : {
          openGraph: {
            type: "website",
            title,
            description,
            siteName,
          },
          twitter: {
            card: "summary",
            title,
            description,
          },
        }),
  };
}

/**
 * Build the site-wide favicon `icons` metadata (ENG-572).
 *
 * Call this ONLY from the root layout's `generateMetadata`.
 */
export function brandingIcons(
  iconUrl?: OptSeoStr,
): NonNullable<Metadata["icons"]> {
  const normalized = normalizeUrl(iconUrl);
  const favicon = normalized ?? "/icon-default.svg";
  return {
    icon: [{ url: favicon }],
    shortcut: favicon,
    ...(normalized ? { apple: normalized } : {}),
  };
}

/** Optional fallbacks for {@link makeSeoMetadata} (EOPT-safe). */
export type MakeSeoMetadataFallback = {
  title?: string | undefined;
  description?: string | undefined;
  /** Explicit canonical URL the caller computed (e.g. PDP per-colorway). */
  canonical?: string | undefined;
  /** Explicit OG image the caller computed (e.g. variant / Yoast image). */
  ogImage?: string | undefined;
  /** Dashboard SEO OG image (after entity, before branding icon). */
  dashboardOgImageUrl?: string | undefined;
  /** Branding icon as last OG fallback. */
  brandingIconUrl?: string | undefined;
  /** Store name for title templates / openGraph.siteName. */
  storeName?: string | undefined;
  /** Store-level allow indexing (default true). */
  allowIndexing?: boolean | undefined;
};

/** Build page metadata from a SeoData object returned by the SDK. */
export function makeSeoMetadata(
  seo?: SeoData | null,
  fallback?: MakeSeoMetadataFallback,
): Metadata {
  const storeName = resolveStoreName(fallback?.storeName);
  const allowIndexing = fallback?.allowIndexing !== false;

  // Real SEO title wins as absolute (Yoast is often already "{name} - {site}").
  // Otherwise use the bare entity name so the root `%s | {storeName}` template
  // appends the store suffix once.
  const seoTitle = isRealSeoTitle(seo?.title) ? seo!.title.trim() : null;
  const entityName = seoFallbackTitle(fallback?.title, storeName);
  const displayTitle = seoTitle ?? entityName;
  const titleMeta: Metadata["title"] = seoTitle
    ? { absolute: seoTitle }
    : entityName;
  const description = stripTags(
    seo?.metaDesc ?? seo?.opengraphDescription ?? fallback?.description,
  );
  const canonical =
    normalizeUrl(seo?.canonical) ?? normalizeUrl(fallback?.canonical);

  const entityOg =
    (seo as SeoData & { opengraphImageUrl?: string | null })
      ?.opengraphImageUrl ??
    (seo as SeoData & { twitterImageUrl?: string | null })?.twitterImageUrl ??
    null;

  const ogImage = resolveOgImageUrl({
    entityImageUrl: fallback?.ogImage ?? entityOg,
    dashboardOgImageUrl: fallback?.dashboardOgImageUrl,
    brandingIconUrl: fallback?.brandingIconUrl,
  });

  return {
    title: titleMeta,
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    alternates: canonical ? { canonical } : undefined,
    robots: resolveRobots(allowIndexing),
    openGraph: {
      type: "website",
      title: seo?.opengraphTitle || displayTitle,
      description: stripTags(seo?.opengraphDescription ?? description),
      url: canonical,
      siteName: storeName,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: seo?.twitterTitle || displayTitle,
      description: stripTags(seo?.twitterDescription ?? description),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
