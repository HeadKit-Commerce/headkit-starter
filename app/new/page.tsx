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
  title: "New Arrivals",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/new` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getNewArrivalsFilters() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:new", "headkit:products");
  return sdk.collections.getFilters();
}

async function getNewArrivalsProducts(
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:new", "headkit:products");
  return sdk.collections.list(filter, page, perPage);
}

async function NewArrivalsProductsServer({
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

  const productsResult = await getNewArrivalsProducts(
    buildProductListFilter(
      {
        categories: [],
        brands: [],
        attributes: {},
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      },
      { isNew: true },
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
      isNew
    />
  );
}

export default async function Page({ searchParams }: Props) {
  const perPage = 24;
  const productFilter = await getNewArrivalsFilters();

  return (
    <>
      <CollectionHeader
        name="New Arrivals"
        description="Discover our latest products"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "New Arrivals", uri: "/new", current: true },
        ]}
      />
      <Suspense fallback={<CollectionPageSkeleton />}>
        <NewArrivalsProductsServer
          productFilter={productFilter}
          searchParams={searchParams}
          perPage={perPage}
        />
      </Suspense>
    </>
  );
}
