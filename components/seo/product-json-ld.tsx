import type { ProductFieldsFragment } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";
import { productPath } from "@/lib/canonical-path";
import { safeJsonLdStringify } from "./safe-json-ld";
import { resolveJsonLdSiteUrl } from "./site-origin";

type JsonLdVariation = ProductFieldsFragment["variations"][number];

interface ProductJsonLDProps {
  product: ProductFieldsFragment & {
    seo?: { metaDesc?: string | null } | null;
  };
  currency?: string | null;
  url?: string;
  brandName?: string;
  /** Origin override; omit to resolve the runtime store domain. */
  siteUrl?: string | null;
}

const ATTR_SLUG_TO_SCHEMA_URI: Record<string, string> = {
  pa_colour: "https://schema.org/color",
  pa_color: "https://schema.org/color",
  pa_size: "https://schema.org/size",
  pa_material: "https://schema.org/material",
  pa_pattern: "https://schema.org/pattern",
};

const ATTR_SLUG_TO_SCHEMA_PROP: Record<string, string> = {
  pa_colour: "color",
  pa_color: "color",
  pa_size: "size",
  pa_material: "material",
  pa_pattern: "pattern",
};

function matchAvailability(stockStatus: string): string {
  switch (stockStatus.toLowerCase()) {
    case "onbackorder":
      return "https://schema.org/BackOrder";
    case "outofstock":
      return "https://schema.org/OutOfStock";
    default:
      return "https://schema.org/InStock";
  }
}

function collectImages(product: ProductFieldsFragment): string[] {
  return [product.image?.src, ...product.images.map((img) => img.src)].filter(
    (src): src is string => Boolean(src),
  );
}

function buildVariantUrl(baseUrl: string, variation: JsonLdVariation): string {
  const colorAttr = variation.attributes.find(
    (attr) => attr.key === "pa_color" || attr.key === "pa_colour",
  );
  return colorAttr?.value ? `${baseUrl}/${colorAttr.value}` : baseUrl;
}

function buildVariantProduct(
  variation: JsonLdVariation,
  parentSku: string,
  currency: string,
  baseUrl: string,
): Record<string, unknown> {
  const variantUrl = buildVariantUrl(baseUrl, variation);

  const attrProps: Record<string, string> = {};
  for (const attr of variation.attributes) {
    const schemaProp = ATTR_SLUG_TO_SCHEMA_PROP[attr.key];
    if (schemaProp && attr.value) {
      attrProps[schemaProp] = attr.value;
    }
  }

  const sku = variation.sku || parentSku || undefined;

  return {
    "@type": "Product",
    name:
      variation.attributes
        .map((a) => decodeHtmlEntities(a.value))
        .join(" / ") || "Variant",
    ...(sku ? { sku } : {}),
    image: variation.image?.src ? [variation.image.src] : undefined,
    offers: {
      "@type": "Offer",
      url: variantUrl,
      price: variation.price ?? "",
      priceCurrency: currency,
      availability: matchAvailability(variation.stockStatus),
      itemCondition: "https://schema.org/NewCondition",
    },
    ...attrProps,
  };
}

export async function ProductJsonLD({
  product,
  currency = "AUD",
  url,
  brandName,
  siteUrl,
}: ProductJsonLDProps) {
  const origin = await resolveJsonLdSiteUrl(siteUrl);
  // `url`/`offers.url` must name the SAME string as the canonical tag and the
  // sitemap entry. Resolved from the product itself rather than synthesised as
  // `/products/{slug}`, which is the shape that now 308s away — a JSON-LD `url`
  // pointing at a redirect is the split this consolidation closes.
  //
  // The `url` prop MUST be the product's BASE path, never a colourway path.
  // `buildVariantUrl` derives every `hasVariant[].offers.url` by APPENDING a
  // colour segment to whatever is passed here, so a colourway path
  // double-appends: `/shop/{cat…}/{slug}/red` becomes `.../red/blue`.
  //
  // Nothing in the classifier rejects that shape. `resolveShopPath` reads a
  // remainder that long as a product under an unvalidated ancestry chain and
  // hands the route two candidate slugs — here `blue`, then `red` — so the URL
  // 404s only because the CATALOGUE has neither. A store that happens to sell a
  // product whose slug matches a colour would serve 200 on the doubled URL
  // instead, which is a duplicate rather than a hard error but is not what
  // anyone intends either. The rule is therefore the guard, not the classifier.
  // `app/canonical-url-shape.test.tsx` puts every emitted `/shop/…` path
  // through the same classifier AND the same catalogue check the route uses.
  //
  // The colourway's own `<link rel="canonical">` is emitted separately by the
  // PDP's `generateMetadata` and is unaffected by this.
  const productUrl = url ?? `${origin}${productPath(product)}`;
  const resolvedCurrency = currency ?? "AUD";
  const description = product.seo?.metaDesc ?? product.shortDescription;
  const images = collectImages(product);
  const decodedDescription = description
    ? decodeHtmlEntities(description)
    : description;

  const brand = brandName
    ? { "@type": "Brand", name: decodeHtmlEntities(brandName) }
    : undefined;

  if (product.type === "variable" && product.variations.length > 0) {
    const variationAttrs = product.attributes.filter((attr) => attr.variation);

    const variesBy = variationAttrs
      .map((attr) => ATTR_SLUG_TO_SCHEMA_URI[attr.slug])
      .filter((uri): uri is string => Boolean(uri));

    const hasVariant = product.variations.map((v) =>
      buildVariantProduct(v, product.sku, resolvedCurrency, productUrl),
    );

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      name: decodeHtmlEntities(product.name),
      description: decodedDescription,
      image: images,
      url: productUrl,
      productGroupID: product.id,
      ...(product.sku ? { sku: product.sku } : {}),
      ...(brand ? { brand } : {}),
      ...(variesBy.length > 0 ? { variesBy } : {}),
      ...(hasVariant.length > 0 ? { hasVariant } : {}),
    };

    return (
      <script
        id="productJsonLD"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: decodeHtmlEntities(product.name),
    description: decodedDescription,
    ...(product.sku ? { sku: product.sku } : {}),
    image: images,
    url: productUrl,
    ...(brand ? { brand } : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      price: parseFloat(product.price) || 0,
      priceCurrency: resolvedCurrency,
      availability: matchAvailability(product.stockStatus),
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <script
      id="productJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
