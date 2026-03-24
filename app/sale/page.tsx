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
  title: "Sale",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/sale` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getSaleFilters() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:sale", "headkit:products");
  return sdk.collections.getFilters();
}

async function getSaleProducts(
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products:sale", "headkit:products");
  return sdk.collections.list(filter, page, perPage);
}

async function SaleProductsServer({
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

  const productsResult = await getSaleProducts(
    buildProductListFilter(
      {
        categories: [],
        brands: [],
        attributes: {},
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      },
      { onSale: true },
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
      onSale
    />
  );
}

export default async function Page({ searchParams }: Props) {
  const perPage = 24;
  const productFilter = await getSaleFilters();

  return (
    <>
      <CollectionHeader
        name="Sale"
        description="Shop our sale items with great discounts!"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Sale", uri: "/sale", current: true },
        ]}
      />
      <Suspense fallback={<CollectionPageSkeleton />}>
        <SaleProductsServer
          productFilter={productFilter}
          searchParams={searchParams}
          perPage={perPage}
        />
      </Suspense>
    </>
  );
}
