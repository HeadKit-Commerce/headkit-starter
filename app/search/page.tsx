import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cacheTag } from "next/cache";
import { cacheLifeForProfile } from "@/lib/cache-profile";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { getBranding } from "@/lib/branding";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";

const PER_PAGE = CATALOG_PAGE_SIZE;

const SEARCH_DESCRIPTION =
  "Search the product catalog by name or keyword. Filter matches by category, price, and availability.";

const SEARCH_BREADCRUMBS = [
  { name: "Home", uri: "/", current: false },
  { name: "Search", uri: "/search", current: true },
] as const;

/**
 * Metadata does not read `searchParams`. Awaiting `?q=` opted this route out
 * of the static shell, and the query string is disallowed in robots.txt, so
 * the canonical document is the bare `/search` URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { storeSettings, seoSettings, branding } = await getBranding();
    return await makeSeoMetadata(null, {
      title: "Search",
      description: SEARCH_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl("/search", storeSettings.domain),
      siteUrl: storeSettings.domain,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: branding?.iconUrl ?? undefined,
    });
  } catch {
    return await makeSeoMetadata(null, {
      title: "Search",
      description: SEARCH_DESCRIPTION,
      canonical: storefrontUrl("/search"),
    });
  }
}

/**
 * Aggregated facet options for the search shell.
 *
 * `"use cache: remote"`, not plain `"use cache"`: the plain directive is a
 * per-instance in-memory LRU that does not persist across requests in
 * serverless, so this store-wide `product-filters` read — ~12 s of WordPress
 * aggregation on a large catalogue — was re-executed on every `/search` view
 * and measured 14.4–17.1 s, all of it in the streamed tail behind a cache
 * header reading HIT.
 */
async function getSearchFilters() {
  "use cache: remote";
  cacheLifeForProfile("hours", "max");
  cacheTag("headkit:products");
  return sdk.collections.getFilters();
}

/**
 * Instant Navigation (Next.js 16.3): sync default export. Page 1 of the
 * catalog is in the HTML. `?q=` is copied into the grid on mount
 * (`searchTermFromQuery`) — reading it on the server kept the document open
 * until an uncached `collections.list` finished, which is what a crawler
 * records as a slow page even when the edge cache says HIT.
 */
export const instant = true;

export default function Page(): ReactNode {
  return (
    <>
      <BreadcrumbJsonLD
        items={SEARCH_BREADCRUMBS.map((crumb) => ({
          name: crumb.name,
          href: crumb.uri,
        }))}
      />
      <CollectionHeader
        name="Search"
        description={SEARCH_DESCRIPTION}
        breadcrumbs={[...SEARCH_BREADCRUMBS]}
        childBasePath="/collections"
      />
      <SearchProductsShell />
    </>
  );
}

/**
 * Unfiltered page 1, cached with the shop catalog. A query is not part of
 * this shell: `CollectionProvider` refetches when `?q=` is present. Scoped as
 * `shop` so product and shop-landing invalidation cover it without a new
 * route-tag union member.
 */
async function SearchProductsShell() {
  const filter = buildProductListFilter({
    ...DEFAULT_FILTER_VALUES,
    page: 1,
  });
  const [productsResult, productFilter] = await Promise.all([
    getCachedCatalogPage(filter, 1, PER_PAGE, { kind: "shop" }),
    getSearchFilters(),
  ]);
  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={1}
      itemsPerPage={PER_PAGE}
    />
  );
}
