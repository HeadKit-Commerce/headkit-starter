import type { Metadata } from "next";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";

export const metadata: Metadata = {
  title: "Shop",
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/shop`,
  },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const perPage = 24;

  const [productsResult, productFilter] = await Promise.all([
    sdk.collections.list(
      buildProductListFilter({
        categories: [],
        brands: [],
        attributes: {},
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      }),
      page,
      perPage,
    ),
    sdk.collections.getFilters(),
  ]);

  return (
    <>
      <CollectionHeader
        name="Shop"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Shop", uri: "/shop", current: true },
        ]}
      />
      <CollectionPage
        initialProducts={productsResult.products}
        initialTotal={productsResult.total}
        productFilter={productFilter}
        initialPage={page}
        itemsPerPage={perPage}
      />
    </>
  );
}
