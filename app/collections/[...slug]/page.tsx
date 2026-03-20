import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  buildBreadcrumbFromCategory,
} from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

async function getCategoryData(categorySlug: string) {
  "use cache";

  const [category, productFilter] = await Promise.all([
    sdk.collections.getCategory(categorySlug),
    sdk.collections.getFilters(categorySlug),
  ]);

  return { category, productFilter };
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

  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const perPage = 24;

  try {
    const { category, productFilter } = await getCategoryData(categorySlug);
    if (!category) return notFound();

    const attributes: Record<string, string[]> = {};
    productFilter.attributes?.forEach((attr) => {
      if (!attr?.slug) return;
      const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
      if (values.length) attributes[attr.slug] = values;
    });

    const productsResult = await sdk.collections.list(
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

    const breadcrumbs = buildBreadcrumbFromCategory(category);

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
        <Suspense>
          <CollectionPage
            initialProducts={productsResult.products}
            initialTotal={productsResult.total}
            productFilter={productFilter}
            initialPage={page}
            itemsPerPage={perPage}
            categorySlug={categorySlug}
          />
        </Suspense>
      </>
    );
  } catch {
    return notFound();
  }
}
