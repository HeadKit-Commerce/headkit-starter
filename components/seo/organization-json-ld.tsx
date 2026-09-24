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
  /** E.164-or-display phone for the trading address. */
  telephone?: string;
  email?: string;
  /**
   * Pre-built schema.org nodes, passed through verbatim. They are merchant
   * CLAIMS — what the business will do for a customer — so they are NEVER
   * defaulted here and the starter passes neither: a caller either has a real
   * source (the merchant's own returns / shipping pages) or omits the prop. An
   * absent claim is always better than an invented one, and a store that adds
   * one should record per property where the value came from.
   *
   * `MerchantReturnPolicy` nests directly under `Organization`.
   */
  hasMerchantReturnPolicy?: Record<string, unknown>;
  /**
   * Organization-level shipping is `hasShippingService` / `ShippingService` /
   * `ShippingConditions` — NOT `shippingDetails`, which schema.org defines on
   * `Offer` only and which validator.schema.org reports as an unknown field on
   * an `Organization`. Same claim rule as above: never defaulted.
   */
  hasShippingService?: Record<string, unknown>[];
}

/**
 * Site-wide Organization JSON-LD. Render once from the root layout.
 * Uses a stable `@id` so WebSite.publisher can reference it without duplicating
 * the Organization graph node.
 */
export function OrganizationJsonLD({
  name,
  url,
  logoUrl,
  contactPoint,
  address,
  sameAs,
  telephone,
  email,
  hasMerchantReturnPolicy,
  hasShippingService,
}: OrganizationJsonLDProps) {
  const logo =
    logoUrl?.trim() ||
    (url ? `${url.replace(/\/$/, "")}/api/icon?size=512` : undefined);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url ? `${url}/#organization` : undefined,
    name,
    url,
  };

  if (logo) {
    schema.logo = {
      "@type": "ImageObject",
      "@id": url ? `${url}/#logo` : undefined,
      url: logo,
      contentUrl: logo,
      width: 512,
      height: 512,
      caption: name,
    };
    schema.image = { "@id": url ? `${url}/#logo` : logo };
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

  if (telephone) schema.telephone = telephone;
  if (email) schema.email = email;
  if (hasMerchantReturnPolicy) {
    schema.hasMerchantReturnPolicy = hasMerchantReturnPolicy;
  }
  if (hasShippingService && hasShippingService.length > 0) {
    schema.hasShippingService = hasShippingService;
  }

  return (
    <script
      id="organizationJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  );
}
