import type { BreadcrumbList, ListItem, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

export interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface BreadcrumbJsonLDProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbJsonLD({ items }: BreadcrumbJsonLDProps) {
  const jsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.href ? { item: item.href } : {}),
    })) as ListItem[],
  };

  return (
    <script
      id="breadcrumbJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
