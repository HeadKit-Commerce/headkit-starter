import type { Product, ProductVariation } from "@headkit/sdk";
import { safeJsonLdStringify } from "./safe-json-ld";

interface ProductJsonLDProps {
  product: Product & { seo?: { metaDesc?: string | null } | null };
  currency?: string | null;
  url?: string;
  brandName?: string;
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

function collectImages(product: Product): string[] {
  return [product.image?.src, ...product.images.map((img) => img.src)].filter(
    (src): src is string => Boolean(src),
  );
}

function buildVariantUrl(baseUrl: string, variation: ProductVariation): string {
  const colorAttr = variation.attributes.find(
    (attr) => attr.key === "pa_color" || attr.key === "pa_colour",
  );
  return colorAttr?.value ? `${baseUrl}/${colorAttr.value}` : baseUrl;
}

function buildVariantProduct(
  variation: ProductVariation,
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
    name: variation.attributes.map((a) => a.value).join(" / ") || "Variant",
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

export function ProductJsonLD({
  product,
  currency = "AUD",
  url,
  brandName,
}: ProductJsonLDProps) {
  const siteUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
  const productUrl = url ?? `${siteUrl}/products/${product.slug}`;
  const resolvedCurrency = currency ?? "AUD";
  const description = product.seo?.metaDesc ?? product.shortDescription;
  const images = collectImages(product);

  const brand = brandName ? { "@type": "Brand", name: brandName } : undefined;

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
      name: product.name,
      description,
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
    name: product.name,
    description,
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
