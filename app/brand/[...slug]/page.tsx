import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { TAG } from "@/lib/cache-tags";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

async function getBrandData(brandSlug: string) {
  "use cache";
  // Finite days backstop — matches collections/product parity (was max).
  cacheLife("days");
  cacheTag(TAG.brand(brandSlug), TAG.brands);
  return sdk.brands.get(brandSlug);
}

async function getBrandFilters(brandSlug: string) {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(TAG.brand(brandSlug), "catalog:filters");
  return sdk.collections.getFilters();
}

async function BrandProductsServer({
  brandSlug,
  productFilter,
  searchParams,
}: {
  brandSlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  const filter = buildProductListFilter(
    {
      categories: sp.categories?.split(",").filter(Boolean) ?? [],
      brands: [brandSlug],
      attributes: {},
      instock: sp.instock === "true",
      sort: (sp.sort ?? "") as SortKeyType | "",
      page,
    },
    { brandSlug },
  );

  // Shared remote catalog cache with Server Actions (ENG-853) — minutes TTL.
  const productsResult = await getCachedCatalogPage(
    filter,
    page,
    PER_PAGE,
    { kind: "brand", slug: brandSlug },
  );

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={PER_PAGE}
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
          />
        </Suspense>
      </>
    );
  } catch {
    return notFound();
  }
}
