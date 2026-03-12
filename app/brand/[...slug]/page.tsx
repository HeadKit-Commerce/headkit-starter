import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headkit as sdk } from "@/lib/sdk";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata } from "@/lib/make-metadata";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return {};
  try {
    const brand = await sdk.brands.get(brandSlug);
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

  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const perPage = 24;

  try {
    const [brand, productFilter, productsResult] = await Promise.all([
      sdk.brands.get(brandSlug),
      sdk.collections.getFilters(),
      sdk.collections.list(
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
      ),
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
        <CollectionPage
          initialProducts={productsResult.products}
          initialTotal={productsResult.total}
          productFilter={productFilter}
          initialPage={page}
          itemsPerPage={perPage}
          brandSlug={brandSlug}
        />
      </>
    );
  } catch {
    return notFound();
  }
}
