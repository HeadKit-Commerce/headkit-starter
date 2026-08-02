import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import type { ItemList, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

/** Minimal product fields required for ItemList / Product carousel JSON-LD. */
type CarouselProduct = Pick<
  ProductSummaryFieldsFragment,
  "name" | "slug" | "price" | "salePrice" | "stockStatus"
> & {
  image?: { src?: string | null } | null;
};

interface CarouselProductJsonLDProps {
  products: CarouselProduct[];
  currency?: string | null;
}

export function CarouselProductJsonLD({
  products,
  currency = "AUD",
}: CarouselProductJsonLDProps) {
  const siteUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL ?? "").replace(
    /\/$/,
    "",
  );

  const jsonLd: WithContext<ItemList> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: product.name,
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
        url: `${siteUrl}/products/${product.slug}`,
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
