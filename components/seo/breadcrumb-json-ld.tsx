import type { BreadcrumbList, ListItem, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

export interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface BreadcrumbJsonLDProps {
  items: BreadcrumbItem[];
}

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

/** Prefer absolute URLs for schema.org BreadcrumbList `item` values. */
function absoluteUrl(href?: string): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (!SITE_URL) return href;
  const base = SITE_URL.replace(/\/$/, "");
  return href.startsWith("/") ? `${base}${href}` : `${base}/${href}`;
}

export function BreadcrumbJsonLD({ items }: BreadcrumbJsonLDProps) {
  const jsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const url = absoluteUrl(item.href);
      return {
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
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
