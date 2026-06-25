import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { Product, RelatedProduct, SeoData } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { ProductDetail } from "@/components/headkit-ui/product-detail";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductJsonLD } from "@/components/seo/product-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
};

async function getProduct(slug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:product:${slug}`, "headkit:products");
  return headkit.products.get(slug);
}

// Dynamic inner component — awaits searchParams for variant pre-selection only
async function ProductDetailServer({
  product,
  breadcrumbItems,
  searchParams,
}: {
  product: Product;
  breadcrumbItems: { name: string; uri: string; current: boolean }[];
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  return (
    <div className="px-5 py-8 md:px-10">
      <ProductDetail
        product={product}
        initialSearchParams={sp}
        breadcrumbItems={breadcrumbItems}
      />
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="px-5 py-8 md:px-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const productSlug = slug[slug.length - 1]!;

  try {
    // The SDK Product type does not yet expose Yoast SEOData (the GetProduct
    // GraphQL fragment selects no `seo` field — see deferred-items.md / future
    // SDK-layer plan). Widen the cached fetched product so `product.seo` is read
    // defensively: once the schema + codegen add `Product.seo`, the real
    // SEOData flows through here with no further change. Until then it resolves
    // to null and the templated per-entity fallback (FE-09 / D-04) is the floor.
    const product = (await getProduct(productSlug)) as
      | (Product & { seo?: SeoData | null })
      | null;
    if (!product) {
      return { robots: { index: false, follow: false } };
    }

    const productSeo: SeoData | null = product.seo ?? null;
    return makeSeoMetadata(productSeo, {
      title: product.name,
      description:
        product.shortDescription ||
        product.description ||
        seoFallbackDescription("product", product.name),
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
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
      uri: `/products/${r.slug}`,
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
      // The lighter RelatedProduct shape (product.related) does not carry these
      // Product fields, and the related-products carousel does not read them.
      // Default them type-correctly so the map satisfies the widened Product
      // type without unsafe casts: rating/review absent → empty/zero; no brand
      // or cross/upsell data on related → empty lists; never a gift card here.
      averageRating: "",
      reviewCount: 0,
      brands: [],
      crossSells: [],
      upsells: [],
      isGiftCard: false,
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

      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailServer
          product={product}
          breadcrumbItems={breadcrumbItems}
          searchParams={searchParams}
        />
      </Suspense>

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
