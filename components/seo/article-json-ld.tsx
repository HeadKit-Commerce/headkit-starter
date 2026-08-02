import type { SeoData } from "@headkit/sdk";
import type { Article, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

interface ArticleJsonLDProps {
  seo?: SeoData | null | undefined;
  siteName?: string | undefined;
  datePublished?: string | undefined;
  dateModified?: string | undefined;
  image?: string | undefined;
  url?: string | undefined;
}

export function ArticleJsonLD({
  seo,
  siteName,
  datePublished,
  dateModified,
  image,
  url,
}: ArticleJsonLDProps) {
  const siteUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
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
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      url: siteUrl,
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
