import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Product, RelatedProduct } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { ProductDetail } from "@/components/headkit-ui/product-detail";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductJsonLD } from "@/components/seo/product-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
};

async function getProduct(slug: string) {
  "use cache";
  return headkit.products.get(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const productSlug = slug[slug.length - 1]!;

  try {
    const product = await headkit.products.get(productSlug);
    if (!product) {
      return { robots: { index: false, follow: false } };
    }

    const desc = product.shortDescription || product.description;
    return makeSeoMetadata(null, {
      title: product.name,
      ...(desc ? { description: desc } : {}),
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const productSlug = slug[slug.length - 1]!;

  const product = await getProduct(productSlug);

  if (!product) {
    notFound();
  }

  const relatedAsProducts: Product[] = product.related.map(
    (r: RelatedProduct) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      uri: `/shop/${r.slug}`,
      isNew: false,
      description: "",
      shortDescription: "",
      price: r.price,
      regularPrice: r.regularPrice,
      salePrice: r.salePrice,
      onSale: r.onSale,
      available: r.stockStatus?.toLowerCase() !== "outofstock",
      sku: "",
      type: r.type,
      stockStatus: r.stockStatus,
      stockQuantity: null,
      permalink: r.permalink,
      image: r.image ?? null,
      images: r.image ? [r.image] : [],
      categories: [],
      tags: [],
      attributes: r.attributes ?? [],
      variations: r.variations ?? [],
      related: [],
    }),
  );

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Shop", href: "/shop" },
    ...(product.categories?.length
      ? [
          {
            name: product.categories[0]!.name,
            href: `/collections/${product.categories[0]!.slug}`,
          },
        ]
      : []),
    { name: product.name, href: `/shop/${product.slug}` },
  ];

  const breadcrumbItems = breadcrumbs.map((b, i) => ({
    name: b.name,
    uri: b.href,
    current: i === breadcrumbs.length - 1,
  }));

  return (
    <div>
      <ProductJsonLD product={product} />
      <BreadcrumbJsonLD items={breadcrumbs} />

      <div className="px-5 py-8 md:px-10">
        <ProductDetail product={product} initialSearchParams={sp} breadcrumbItems={breadcrumbItems} />
      </div>

      {relatedAsProducts.length > 0 && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="You might also like"
            description=""
            allButton="View All"
            allButtonPath="/shop"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProductCarousel
              products={relatedAsProducts}
              id="related-products"
            />
          </div>
        </section>
      )}
    </div>
  );
}
