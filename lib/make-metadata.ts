import type { Metadata } from "next";
import type { SeoData } from "@headkit/sdk";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
const SITE_NAME = "HeadKit";

function stripTags(html?: string | null): string {
  return (html ?? "").replace(/<[^>]*>/g, "");
}

export type SeoEntityType = "product" | "category" | "page";

/**
 * Templated per-entity SEO description fallback (FE-09 / D-04).
 *
 * When Yoast / SDK SEOData is absent, every entity route still needs a
 * non-empty, sensible description. This returns a distinct templated default
 * per entity type built only from the public entity name — no sensitive data.
 */
export function seoFallbackDescription(
  entityType: SeoEntityType,
  name: string,
): string {
  const trimmed = (name ?? "").trim();
  const label = trimmed.length > 0 ? trimmed : SITE_NAME;
  switch (entityType) {
    case "product":
      return `Shop ${label} at ${SITE_NAME}. View details, pricing, and availability.`;
    case "category":
      return `Browse ${label} at ${SITE_NAME}. Discover products in the ${label} collection.`;
    case "page":
      return `${label} — read more on ${SITE_NAME}.`;
  }
}

/**
 * Templated per-entity SEO title fallback (FE-09 / D-04).
 *
 * When Yoast / SDK SEOData is absent, the title floor is the entity name
 * suffixed with the site name (e.g. "Widgets | HeadKit"). When the entity
 * name itself is empty, fall back to the bare site name.
 */
function seoFallbackTitle(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? `${trimmed} | ${SITE_NAME}` : SITE_NAME;
}

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return url;
}

/** Build root (homepage) metadata from optional title/description overrides. */
export function makeRootMetadata(options?: {
  title?: string | null;
  description?: string | null;
  siteName?: string | null;
  /**
   * Per-store branding icon URL (ENG-572). When set it drives the browser-tab
   * favicon, the apple-touch icon, and the OG/Twitter share image. When null/
   * undefined every icon key is omitted so Next.js keeps the file-convention
   * default (`app/favicon.ico` / `app/icon0.svg`).
   */
  iconUrl?: string | null;
}): Metadata {
  const title = options?.title ?? options?.siteName ?? "HeadKit";
  const description = stripTags(options?.description ?? "");
  const siteName = options?.siteName ?? "HeadKit";
  const iconUrl = normalizeUrl(options?.iconUrl);

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    applicationName: siteName,
    // NOTE: favicon `icons` are intentionally NOT set here. They are site-wide
    // and belong to the ROOT layout only (via `brandingIcons`). Emitting them
    // here would let every page-level `makeRootMetadata` caller (e.g. the
    // homepage) clobber the layout's per-store favicon on merge (ENG-572).
    //
    // Share/OG icon uses the branding asset only when configured (unchanged
    // default behavior when absent).
    ...(iconUrl
      ? {
          openGraph: {
            type: "website",
            title,
            description,
            siteName,
            images: [iconUrl],
          },
          twitter: {
            card: "summary",
            title,
            description,
            images: [iconUrl],
          },
        }
      : {}),
  };
}

/**
 * Build the site-wide favicon `icons` metadata (ENG-572).
 *
 * Call this ONLY from the root layout's `generateMetadata` — icons are a
 * layout-level concern and must not be re-emitted by page metadata (which would
 * override the per-store favicon on merge).
 *
 * The static file-convention tab icons (`app/favicon.ico` / `icon0.svg` /
 * `icon1.png`) were removed so this is the single source of `<link rel="icon">`.
 * Otherwise Next always emits `/favicon.ico` (sizes="48x48") and browsers prefer
 * the `.ico`, so the store asset never wins the tab. Falls back to the bundled
 * default mark (`public/icon-default.svg`, the former `icon0.svg`) when no
 * branding icon is set.
 */
export function brandingIcons(
  iconUrl?: string | null,
): NonNullable<Metadata["icons"]> {
  const normalized = normalizeUrl(iconUrl);
  const favicon = normalized ?? "/icon-default.svg";
  return {
    icon: [{ url: favicon }],
    shortcut: favicon,
    // apple-touch: branding icon when set; otherwise the static
    // `app/apple-icon.png` convention supplies the default.
    ...(normalized ? { apple: normalized } : {}),
  };
}

/** Build page metadata from a SeoData object returned by the SDK. */
export function makeSeoMetadata(
  seo?: SeoData | null,
  fallback?: Partial<{
    title: string;
    description: string;
    /** Explicit canonical URL the caller computed (e.g. PDP per-colorway). */
    canonical: string;
    /** Explicit OG image the caller computed (e.g. variant image). */
    ogImage: string;
  }>,
): Metadata {
  const isProduction = process.env.VERCEL_ENV === "production";

  // Real SEO title wins verbatim; otherwise emit the templated per-entity
  // fallback ("{name} | HeadKit") so Yoast-less entities still get a sane
  // title floor (FE-09 / D-04).
  const title = seo?.title ?? seoFallbackTitle(fallback?.title);
  const description = stripTags(
    seo?.metaDesc ?? seo?.opengraphDescription ?? fallback?.description,
  );
  // Canonical precedence: explicit seo.canonical wins; otherwise the caller's
  // computed fallback.canonical (PDP per-colorway self-canonical). Both are
  // normalized to absolute URLs.
  const canonical =
    normalizeUrl(seo?.canonical) ?? normalizeUrl(fallback?.canonical);
  // OG image override (variant image for a colorway). When set, becomes the
  // single openGraph image.
  const ogImage = normalizeUrl(fallback?.ogImage);

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    alternates: canonical ? { canonical } : undefined,
    robots: {
      index: isProduction,
      follow: isProduction,
    },
    openGraph: {
      type: "website",
      title: seo?.opengraphTitle ?? title,
      description: stripTags(seo?.opengraphDescription ?? description),
      url: canonical,
      siteName: "HeadKit",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.twitterTitle ?? title,
      description: stripTags(seo?.twitterDescription ?? description),
    },
  };
}
