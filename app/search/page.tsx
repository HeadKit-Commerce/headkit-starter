import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CollectionProductsSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = sp.q ?? "";

  if (!q) {
    return {
      title: "Search",
      description: "Search for products in our store",
    };
  }

  return {
    title: `Search results for "${q}"`,
    description: `Search for "${q}" in our store`,
  };
}

async function getSearchFilters() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:products");
  return sdk.collections.getFilters();
}

/**
 * Dynamic island: awaits searchParams inside Suspense so Instant Navigation
 * can show the static Search shell immediately.
 */
async function SearchResults({ searchParams }: Props): Promise<ReactNode> {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = sp.page ? parseInt(sp.page) : 1;

  const categories = sp.categories?.split(",").filter(Boolean) ?? [];
  const brands = sp.brands?.split(",").filter(Boolean) ?? [];
  const instock = sp.instock === "true";
  const sort = (sp.sort ?? "") as SortKeyType | "";
  const attributes: Record<string, string[]> = {};

  const [productsResult, productFilter] = await Promise.all([
    sdk.collections.list(
      buildProductListFilter(
        {
          categories,
          brands,
          attributes,
          instock,
          sort,
          page,
        },
        { search: q },
      ),
      page,
      PER_PAGE,
    ),
    getSearchFilters(),
  ]);

  const title = q ? `Search results for "${q}"` : "Search products";
  const description = q
    ? `${productsResult.total} product${productsResult.total === 1 ? "" : "s"} found for "${q}"`
    : "Search for products in our store";

  return (
    <>
      <CollectionHeader
        name={title}
        description={description}
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Search", uri: "/search", current: true },
        ]}
      />
      <CollectionPage
        initialProducts={productsResult.products}
        initialTotal={productsResult.total}
        productFilter={productFilter}
        initialPage={page}
        itemsPerPage={PER_PAGE}
        {...(q ? { search: q } : {})}
      />
    </>
  );
}

/**
 * Sync shell — Instant Navigation reuses this App Shell; query-dependent
 * header + grid stream under Suspense with a product skeleton fallback.
 */
export default function Page({ searchParams }: Props): ReactNode {
  return (
    <>
      <BreadcrumbJsonLD
        items={[
          { name: "Home", href: "/" },
          { name: "Search", href: "/search" },
        ]}
      />
      <Suspense
        fallback={
          <>
            <CollectionHeader
              name="Search"
              description="Search for products in our store"
              breadcrumbs={[
                { name: "Home", uri: "/", current: false },
                { name: "Search", uri: "/search", current: true },
              ]}
            />
            <CollectionProductsSkeleton />
          </>
        }
      >
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}
