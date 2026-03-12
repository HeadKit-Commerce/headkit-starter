import type { FaqItem } from "@headkit/sdk";
import { safeJsonLdStringify } from "./safe-json-ld";

interface FAQPageJsonLDProps {
  items: FaqItem[];
}

export function FAQPageJsonLD({ items }: FAQPageJsonLDProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      id="faqPageJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
