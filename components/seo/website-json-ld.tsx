import { safeJsonLdStringify } from "./safe-json-ld";

interface WebsiteJsonLDProps {
  siteName: string;
  siteUrl: string;
  description?: string;
}

export function WebsiteJsonLD({
  siteName,
  siteUrl,
  description,
}: WebsiteJsonLDProps) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: siteName,
    url: siteUrl,
    description: description ?? "",
    potentialAction: [
      {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    ],
    inLanguage: "en-US",
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: siteName,
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      inLanguage: "en-US",
      "@id": `${siteUrl}/#logo`,
      url: `${siteUrl}/api/icon?size=512`,
      contentUrl: `${siteUrl}/api/icon?size=512`,
      width: 512,
      height: 512,
      caption: siteName,
    },
    image: { "@id": `${siteUrl}/#logo` },
  };

  return (
    <>
      <script
        id="websiteJsonLD"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(websiteSchema) }}
      />
      <script
        id="organizationJsonLD"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(organizationSchema),
        }}
      />
    </>
  );
}
