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
}): Metadata {
  const title = options?.title ?? options?.siteName ?? "HeadKit";
  const description = stripTags(options?.description ?? "");

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL || "http://localhost:3000"),
    applicationName: options?.siteName ?? "HeadKit",
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
