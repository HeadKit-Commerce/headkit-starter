import type { Metadata } from "next";
import type { SeoData } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

/**
 * Provider CMS titles that are not real SEO — fall through to dashboard /
 * store name. Applies to Woo (WP defaults) and Shopify Online Store pages
 * titled "Home" / "Homepage".
 */
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

/** Decode + trim CMS/Yoast strings so entities never leak into `<title>` / OG. */
function seoText(value?: OptSeoStr): string {
  return decodeHtmlEntities(value ?? "").trim();
}

function stripTags(html?: OptSeoStr): string {
  return seoText(html).replace(/<[^>]*>/g, "");
}

function normalizeUrl(url?: OptSeoStr): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return url;
}

/** True when a provider CMS title is real SEO (not empty or a generic default). */
export function isRealSeoTitle(title?: OptSeoStr): boolean {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return false;
  return !GENERIC_SEO_TITLES.has(trimmed.toLowerCase());
}

/**
 * True when a CMS/Yoast title already includes the store brand so the root
 * `%s | {storeName}` template must not append again (use `absolute` instead).
 */
export function titleIncludesStoreBrand(
  title: string,
  storeName: string,
): boolean {
  const t = title.trim().toLowerCase();
  const s = storeName.trim().toLowerCase();
  if (!t || !s) return false;
  return (
    t.includes(`| ${s}`) ||
    t.includes(` - ${s}`) ||
    t.includes(` – ${s}`) ||
    t.includes(` — ${s}`) ||
    t.endsWith(` ${s}`) ||
    t === s
  );
}

/**
 * Resolve the store display name used in titles / fallbacks.
 * Never returns HeadKit marketing copy as a tenant default.
 */
export function resolveStoreName(storeName?: OptSeoStr): string {
  const trimmed = seoText(storeName);
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
  const desc = seoText(seoDescription);
  if (desc) return desc;
  return resolveStoreName(storeName);
}

/**
 * Storefront SEO hierarchy (matches Woo + Shopify):
 * 1. Built-in starter fallbacks (`seoFallbackTitle` / `seoFallbackDescription`)
 * 2. Provider SEO — Woo Yoast/Rank Math **or** Shopify Admin search-engine
 *    listing on shop / page / product / article / collection
 * 3. HeadKit dashboard SEO title / description / OG / `allowIndexing`
 *
 * `yoastTitle` / `yoastDescription` remain the param names for call-site
 * compatibility; they mean “provider CMS SEO”, not Woo-only.
 */
export function resolveHomeTitle(options: {
  yoastTitle?: OptSeoStr;
  /** Alias for {@link yoastTitle} (provider SEO title). */
  providerTitle?: OptSeoStr;
  dashboardTitle?: OptSeoStr;
  storeName?: OptSeoStr;
}): string {
  const provider = seoText(options.providerTitle ?? options.yoastTitle);
  if (isRealSeoTitle(provider)) {
    return provider;
  }
  const dashboard = seoText(options.dashboardTitle);
  if (dashboard) return dashboard;
  return resolveStoreName(options.storeName);
}

/**
 * Home description hierarchy: provider metaDesc → dashboard description → empty
 * (layout/OG can still omit empty description; never HeadKit marketing copy).
 */
export function resolveHomeDescription(options: {
  yoastDescription?: OptSeoStr;
  /** Alias for {@link yoastDescription} (provider SEO description). */
  providerDescription?: OptSeoStr;
  dashboardDescription?: OptSeoStr;
}): string {
  const provider = seoText(
    options.providerDescription ?? options.yoastDescription,
  );
  if (provider) return provider;
  return seoText(options.dashboardDescription);
}

/**
 * OG / Twitter image precedence:
 * Provider entity image → dashboard `ogImageUrl` → branding icon → none.
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
 * When provider SEOData (Yoast or Shopify SEO panels) is absent, every entity
 * route still needs a non-empty description from the entity name + store name.
 */
export function seoFallbackDescription(
  entityType: SeoEntityType,
  name: string,
  storeName?: OptSeoStr,
): string {
  const site = resolveStoreName(storeName);
  const trimmed = seoText(name);
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
 * title template appends `| {storeName}`. Callers with a complete provider
 * SEO title should pass it via {@link makeSeoMetadata}, which uses `absolute`.
 */
export function seoFallbackTitle(
  name?: OptSeoStr,
  storeName?: OptSeoStr,
): string {
  const trimmed = seoText(name);
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
  const title = seoText(options?.title) || siteName;
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

  // Real SEO title that already includes the store brand wins as absolute
  // (Yoast is often "{name} - {site}"). Bare page titles (e.g. "Projects")
  // stay as a segment so the root `%s | {storeName}` template appends once.
  // Always decode entities — Yoast frequently emits `&amp;` / `&#8211;`.
  const decodedSeoTitle = seoText(seo?.title);
  const seoTitle = isRealSeoTitle(decodedSeoTitle) ? decodedSeoTitle : null;
  const entityName = seoFallbackTitle(fallback?.title, storeName);
  const displayTitle = seoTitle ?? entityName;
  const titleMeta: Metadata["title"] =
    seoTitle && titleIncludesStoreBrand(seoTitle, storeName)
      ? { absolute: seoTitle }
      : (seoTitle ?? entityName);
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

  const openGraphTitle = seoText(seo?.opengraphTitle) || displayTitle;
  const twitterTitle = seoText(seo?.twitterTitle) || displayTitle;

  return {
    title: titleMeta,
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    alternates: canonical ? { canonical } : undefined,
    robots: resolveRobots(allowIndexing),
    openGraph: {
      type: "website",
      title: openGraphTitle,
      description: stripTags(seo?.opengraphDescription ?? description),
      url: canonical,
      siteName: storeName,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: twitterTitle,
      description: stripTags(seo?.twitterDescription ?? description),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
