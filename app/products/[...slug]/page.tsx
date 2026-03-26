import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { Product, RelatedProduct } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { ProductDetail } from "@/components/headkit-ui/product-detail";
import { ProductStock } from "@/components/headkit-ui/product-stock";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductJsonLD } from "@/components/seo/product-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  params: Promise<{ slug: string[] }>;
};

async function getProduct(slug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:product:${slug}`, "headkit:products");
  return headkit.products.get(slug);
}

function StockSkeleton() {
  return <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />;
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

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const params: { slug: string[] }[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await headkit.products.list({}, page, 100);
    for (const product of result.products) {
      params.push({ slug: [product.slug] });
      const colorAttr = product.attributes.find(
        (a) => a.slug === "pa_color" || a.slug === "pa_colour",
      );
      if (colorAttr) {
        for (const opt of colorAttr.fullOptions) {
          params.push({ slug: [product.slug, opt.slug] });
        }
      }
    }
    hasMore = page < result.totalPages;
    page++;
  }

  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const productSlug = slug[0]!;

  try {
    const product = await getProduct(productSlug);
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

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const productSlug = slug[0]!;
  const colorSlug = slug[1]; // undefined for simple products or base variable URL

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
    }),
  );

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Products", href: "/products" },
    ...(product.categories?.length
      ? [
          {
            name: product.categories[0]!.name,
            href: `/collections/${product.categories[0]!.slug}`,
          },
        ]
      : []),
    {
      name: product.name,
      href: colorSlug
        ? `/products/${product.slug}/${colorSlug}`
        : `/products/${product.slug}`,
    },
  ];

  const breadcrumbItems = breadcrumbs.map((b, i) => ({
    name: b.name,
    uri: b.href,
    current: i === breadcrumbs.length - 1,
  }));

  const stockSlot = (
    <Suspense fallback={<StockSkeleton />}>
      <ProductStock
        productSlug={productSlug}
        {...(colorSlug !== undefined ? { colorSlug } : {})}
      />
    </Suspense>
  );

  return (
    <div>
      <ProductJsonLD product={product} />
      <BreadcrumbJsonLD items={breadcrumbs} />

      <Suspense fallback={<ProductDetailSkeleton />}>
        <div className="px-5 py-8 md:px-10">
          <ProductDetail
            product={product}
            {...(colorSlug !== undefined ? { initialColor: colorSlug } : {})}
            productBasePath={`/products/${productSlug}`}
            breadcrumbItems={breadcrumbItems}
            stockSlot={stockSlot}
          />
        </div>
      </Suspense>

      {relatedAsProducts.length > 0 && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="You might also like"
            description=""
            allButton="View All"
            allButtonPath="/products"
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
