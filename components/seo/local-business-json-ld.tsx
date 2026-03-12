import { safeJsonLdStringify } from "./safe-json-ld";

interface PostalAddressProps {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

interface GeoCoordinatesProps {
  latitude: number;
  longitude: number;
}

interface OpeningHoursProps {
  dayOfWeek: string | string[];
  opens: string;
  closes: string;
}

interface LocalBusinessJsonLDProps {
  name: string;
  url: string;
  description?: string;
  telephone?: string;
  email?: string;
  address?: PostalAddressProps;
  geo?: GeoCoordinatesProps;
  openingHours?: OpeningHoursProps[];
  sameAs?: string[];
  image?: string;
}

export function LocalBusinessJsonLD({
  name,
  url,
  description,
  telephone,
  email,
  address,
  geo,
  openingHours,
  sameAs,
  image,
}: LocalBusinessJsonLDProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url,
  };

  if (description) schema.description = description;
  if (telephone) schema.telephone = telephone;
  if (email) schema.email = email;
  if (image) schema.image = image;

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

  if (geo) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: geo.latitude,
      longitude: geo.longitude,
    };
  }

  if (openingHours && openingHours.length > 0) {
    schema.openingHoursSpecification = openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  if (sameAs && sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return (
    <script
      id="localBusinessJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  );
}
