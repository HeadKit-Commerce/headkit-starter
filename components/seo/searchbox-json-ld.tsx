import type { SearchAction, WebSite, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

interface SearchboxJsonLDProps {
  siteUrl: string;
  siteName: string;
}

export function SearchboxJsonLD({ siteUrl, siteName }: SearchboxJsonLDProps) {
  const jsonLd: WithContext<WebSite> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    } as SearchAction,
  };

  return (
    <script
      id="searchboxJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
