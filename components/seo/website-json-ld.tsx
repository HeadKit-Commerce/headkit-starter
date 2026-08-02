import { safeJsonLdStringify } from "./safe-json-ld";

interface WebsiteJsonLDProps {
  siteName: string;
  siteUrl: string;
  description?: string;
}

/**
 * WebSite JSON-LD only. Organization lives in {@link OrganizationJsonLD}
 * (rendered once in the root layout) so we do not emit Organization twice.
 * SearchAction is included here — do not also mount SearchboxJsonLD.
 */
export function WebsiteJsonLD({
  siteName,
  siteUrl,
  description,
}: WebsiteJsonLDProps) {
  const websiteSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: siteName,
    url: siteUrl,
    inLanguage: "en-US",
    publisher: { "@id": `${siteUrl}/#organization` },
  };

  if (description?.trim()) {
    websiteSchema.description = description.trim();
  }

  if (siteUrl) {
    websiteSchema.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    };
  }

  return (
    <script
      id="websiteJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(websiteSchema) }}
    />
  );
}
