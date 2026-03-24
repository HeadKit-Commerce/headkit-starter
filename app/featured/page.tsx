import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";

export const metadata: Metadata = {
  title: "Featured Products",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/featured` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getFeaturedFilters() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:featured", "headkit:products");
  return sdk.collections.getFilters();
}

async function getFeaturedProducts(
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:featured", "headkit:products");
  return sdk.collections.list(filter, page, perPage);
}

async function FeaturedProductsServer({
  productFilter,
  searchParams,
  perPage,
}: {
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  perPage: number;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  const filter = buildProductListFilter({
    categories: [],
    brands: [],
    attributes: {},
    instock: sp.instock === "true",
    sort: (sp.sort ?? "") as SortKeyType | "",
    page,
  });
  filter.orderby = "menu_order";
  filter.order = "asc";

  const productsResult = await getFeaturedProducts(filter, page, perPage);

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={perPage}
    />
  );
}

export default async function Page({ searchParams }: Props) {
  const perPage = 24;
  const productFilter = await getFeaturedFilters();

  return (
    <>
      <CollectionHeader
        name="Featured Products"
        description="Discover our handpicked selection of featured products"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Featured Products", uri: "/featured", current: true },
        ]}
      />
      <Suspense fallback={<CollectionPageSkeleton />}>
        <FeaturedProductsServer
          productFilter={productFilter}
          searchParams={searchParams}
          perPage={perPage}
        />
      </Suspense>
    </>
  );
}
