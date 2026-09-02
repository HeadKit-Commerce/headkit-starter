import type { BreadcrumbList, ListItem, WithContext } from "schema-dts";
import { decodeHtmlEntities } from "@/lib/utils";
import { stripTitleMarkers } from "@/lib/title-emphasis";
import { safeJsonLdStringify } from "./safe-json-ld";
import { resolveJsonLdSiteUrl } from "./site-origin";

export interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface BreadcrumbJsonLDProps {
  items: BreadcrumbItem[];
  /** Origin override; omit to resolve the runtime store domain. */
  siteUrl?: string | null;
}

/** Prefer absolute URLs for schema.org BreadcrumbList `item` values. */
function absoluteUrl(siteUrl: string, href?: string): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (!siteUrl) return href;
  return href.startsWith("/") ? `${siteUrl}${href}` : `${siteUrl}/${href}`;
}

export async function BreadcrumbJsonLD({
  items,
  siteUrl,
}: BreadcrumbJsonLDProps) {
  const origin = await resolveJsonLdSiteUrl(siteUrl);
  const jsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const url = absoluteUrl(origin, item.href);
      return {
        "@type": "ListItem",
        position: index + 1,
        name: stripTitleMarkers(decodeHtmlEntities(item.name)),
        ...(url ? { item: url } : {}),
      };
    }) as ListItem[],
  };

  return (
    <script
      id="breadcrumbJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
