import type { Metadata } from "next";
import type { SeoData } from "@headkit/sdk";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

function stripTags(html?: string | null): string {
  return (html ?? "").replace(/<[^>]*>/g, "");
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
  fallback?: Partial<{ title: string; description: string }>,
): Metadata {
  const isProduction = process.env.VERCEL_ENV === "production";

  const title = seo?.title ?? fallback?.title ?? "HeadKit";
  const description = stripTags(
    seo?.metaDesc ?? seo?.opengraphDescription ?? fallback?.description,
  );
  const canonical = normalizeUrl(seo?.canonical);

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
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.twitterTitle ?? title,
      description: stripTags(seo?.twitterDescription ?? description),
    },
  };
}
