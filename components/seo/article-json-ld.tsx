import type { SeoData } from "@headkit/sdk";
import type { Article, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";
import { resolveJsonLdSiteUrl } from "./site-origin";

interface ArticleJsonLDProps {
  seo?: SeoData | null | undefined;
  siteName?: string | undefined;
  datePublished?: string | undefined;
  dateModified?: string | undefined;
  image?: string | undefined;
  url?: string | undefined;
  /** Origin override; omit to resolve the runtime store domain. */
  siteUrl?: string | null;
}

export async function ArticleJsonLD({
  seo,
  siteName,
  datePublished,
  dateModified,
  image,
  url,
  siteUrl,
}: ArticleJsonLDProps) {
  // author/publisher must name the same host as `url` (which the route builds
  // from the runtime store domain) — otherwise one graph names two hosts.
  const origin = await resolveJsonLdSiteUrl(siteUrl);
  const publisherName = (siteName ?? "").trim() || "Store";

  const jsonLd: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: seo?.title ?? "",
    ...(url ? { mainEntityOfPage: url, url } : {}),
    ...(image ? { image } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    author: {
      "@type": "Organization",
      name: publisherName,
      url: origin,
    },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      url: origin,
    },
  };

  return (
    <script
      id="articleJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
