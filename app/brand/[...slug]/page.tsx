import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

async function getBrandData(brandSlug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:brand:${brandSlug}`, "headkit:brands");
  return sdk.brands.get(brandSlug);
}

async function getBrandFilters(brandSlug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:brand:${brandSlug}`, "headkit:brands");
  return sdk.collections.getFilters();
}

async function getBrandProducts(
  brandSlug: string,
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:brand:${brandSlug}:products`, "headkit:products");
  return sdk.collections.list(filter, page, perPage);
}

async function BrandProductsServer({
  brandSlug,
  productFilter,
  searchParams,
  perPage,
}: {
  brandSlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  perPage: number;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  const productsResult = await getBrandProducts(
    brandSlug,
    buildProductListFilter(
      {
        categories: sp.categories?.split(",").filter(Boolean) ?? [],
        brands: [brandSlug],
        attributes: {},
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      },
      { brandSlug },
    ),
    page,
    perPage,
  );

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={perPage}
      brandSlug={brandSlug}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return {};
  try {
    const brand = await getBrandData(brandSlug);
    if (!brand) return {};
    return makeSeoMetadata(brand.seo, {
      title: brand.name,
      description: brand.description,
    });
  } catch {
    return {};
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return notFound();

  const perPage = 24;

  try {
    const [brand, productFilter] = await Promise.all([
      getBrandData(brandSlug),
      getBrandFilters(brandSlug),
    ]);

    if (!brand) return notFound();

    const breadcrumbs = [
      { name: "Home", uri: "/", current: false },
      { name: "Brands", uri: "/brand", current: false },
      { name: brand.name, uri: `/brand/${brandSlug}`, current: true },
    ];

    return (
      <>
        <BrandHeader
          name={brand.name}
          description={brand.description}
          thumbnailUrl={brand.thumbnail || brand.image?.src}
          breadcrumbs={breadcrumbs}
        />
        <Suspense fallback={<CollectionPageSkeleton />}>
          <BrandProductsServer
            brandSlug={brandSlug}
            productFilter={productFilter}
            searchParams={searchParams}
            perPage={perPage}
          />
        </Suspense>
      </>
    );
  } catch {
    return notFound();
  }
}
