import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  buildBreadcrumbFromCategory,
} from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

async function getCategoryData(categorySlug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:collection:${categorySlug}`, "headkit:collections");

  const [category, productFilter] = await Promise.all([
    sdk.collections.getCategory(categorySlug),
    sdk.collections.getFilters(categorySlug),
  ]);

  return { category, productFilter };
}

async function getCategoryProducts(
  categorySlug: string,
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:collection:${categorySlug}:products`, "headkit:products");
  return sdk.collections.list(filter, page, perPage);
}

async function CollectionProductsServer({
  categorySlug,
  productFilter,
  searchParams,
  perPage,
}: {
  categorySlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  perPage: number;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  const attributes: Record<string, string[]> = {};
  productFilter.attributes?.forEach((attr) => {
    if (!attr?.slug) return;
    const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
    if (values.length) attributes[attr.slug] = values;
  });

  const productsResult = await getCategoryProducts(
    categorySlug,
    buildProductListFilter(
      {
        categories: sp.categories?.split(",").filter(Boolean) ?? [],
        brands: sp.brands?.split(",").filter(Boolean) ?? [],
        attributes,
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      },
      { categorySlug },
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
      categorySlug={categorySlug}
    />
  );
}

function CollectionProductsSkeleton() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex w-full items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="px-5 md:px-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];
  if (!categorySlug) return {};
  try {
    const { category } = await getCategoryData(categorySlug);
    if (!category) return {};
    return makeSeoMetadata(category.seo, {
      title: category.name,
      description: category.description,
    });
  } catch {
    return {};
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];
  if (!categorySlug) return notFound();

  try {
    const { category, productFilter } = await getCategoryData(categorySlug);
    if (!category) return notFound();

    const breadcrumbs = buildBreadcrumbFromCategory(category);
    const perPage = 24;

    return (
      <>
        <BreadcrumbJsonLD
          items={breadcrumbs.map((b) => ({
            name: b.name,
            href: b.uri,
          }))}
        />
        <CollectionHeader
          name={category.name}
          description={category.description}
          breadcrumbs={breadcrumbs}
          {...(category.thumbnail ? { thumbnail: category.thumbnail } : {})}
          {...(category.children?.length
            ? { children: category.children }
            : {})}
        />
        <Suspense fallback={<CollectionProductsSkeleton />}>
          <CollectionProductsServer
            categorySlug={categorySlug}
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
