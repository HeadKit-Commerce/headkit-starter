import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import type { ItemList, WithContext } from "schema-dts";
import { decodeHtmlEntities } from "@/lib/utils";
import { productPath } from "@/lib/canonical-path";
import { safeJsonLdStringify } from "./safe-json-ld";
import { resolveJsonLdSiteUrl } from "./site-origin";

/**
 * Minimal product fields required for ItemList / Product carousel JSON-LD.
 *
 * `uri` is the product's WooCommerce permalink and is required, not optional:
 * it is what `productPath` resolves the canonical URL from, and omitting it
 * would silently fall the whole carousel back to the flat shape that 308s.
 */
type CarouselProduct = Pick<
  ProductSummaryFieldsFragment,
  "name" | "slug" | "uri" | "price" | "salePrice" | "stockStatus"
> & {
  image?: { src?: string | null } | null;
};

interface CarouselProductJsonLDProps {
  products: CarouselProduct[];
  currency?: string | null;
  /** Origin override; omit to resolve the runtime store domain. */
  siteUrl?: string | null;
}

export async function CarouselProductJsonLD({
  products,
  currency = "AUD",
  siteUrl,
}: CarouselProductJsonLDProps) {
  const origin = await resolveJsonLdSiteUrl(siteUrl);

  const jsonLd: WithContext<ItemList> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: decodeHtmlEntities(product.name ?? ""),
        image: product.image?.src ?? "",
        offers: {
          "@type": "Offer",
          price: parseFloat(product.salePrice ?? product.price ?? "0") || 0,
          availability:
            product.stockStatus === "outofstock"
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
          priceCurrency: currency ?? "AUD",
        },
        url: `${origin}${productPath(product)}`,
      },
    })),
  };

  return (
    <script
      id="carouselProductJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
