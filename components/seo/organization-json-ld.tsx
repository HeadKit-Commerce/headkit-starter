import { safeJsonLdStringify } from "./safe-json-ld";

interface ContactPointProps {
  telephone?: string;
  contactType?: string;
  email?: string;
}

interface PostalAddressProps {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

interface OrganizationJsonLDProps {
  name: string;
  url: string;
  logoUrl?: string;
  contactPoint?: ContactPointProps;
  address?: PostalAddressProps;
  sameAs?: string[];
}

export function OrganizationJsonLD({
  name,
  url,
  logoUrl,
  contactPoint,
  address,
  sameAs,
}: OrganizationJsonLDProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
  };

  if (logoUrl) {
    schema.logo = {
      "@type": "ImageObject",
      url: logoUrl,
      width: 512,
      height: 512,
    };
  }

  if (contactPoint) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      ...(contactPoint.telephone ? { telephone: contactPoint.telephone } : {}),
      ...(contactPoint.contactType
        ? { contactType: contactPoint.contactType }
        : {}),
      ...(contactPoint.email ? { email: contactPoint.email } : {}),
    };
  }

  if (address) {
    schema.address = {
      "@type": "PostalAddress",
      ...(address.streetAddress
        ? { streetAddress: address.streetAddress }
        : {}),
      ...(address.addressLocality
        ? { addressLocality: address.addressLocality }
        : {}),
      ...(address.addressRegion
        ? { addressRegion: address.addressRegion }
        : {}),
      ...(address.postalCode ? { postalCode: address.postalCode } : {}),
      ...(address.addressCountry
        ? { addressCountry: address.addressCountry }
        : {}),
    };
  }

  if (sameAs && sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return (
    <script
      id="organizationJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  );
}
