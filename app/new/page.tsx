import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { cacheLifeForProfile } from "@/lib/cache-profile";
import { headkit as sdk } from "@/lib/sdk";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  DEFAULT_FILTER_VALUES,
  type SortKeyType,
} from "@/components/headkit-ui/collection/utils";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { getBranding } from "@/lib/branding";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";

const NEW_DESCRIPTION =
  "Browse the latest arrivals. See products added most recently, then filter by category, price, and availability.";

/**
 * Canonical origin comes from the RUNTIME store domain, not the build-time
 * `NEXT_PUBLIC_FRONTEND_URL`. See `app/sale/page.tsx`.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { storeSettings, seoSettings, branding } = await getBranding();
    return await makeSeoMetadata(null, {
      title: "New Arrivals",
      description: NEW_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl("/new", storeSettings.domain),
      siteUrl: storeSettings.domain,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: branding?.iconUrl ?? undefined,
    });
  } catch {
    return await makeSeoMetadata(null, {
      title: "New Arrivals",
      description: NEW_DESCRIPTION,
      canonical: storefrontUrl("/new"),
    });
  }
}

const PER_PAGE = CATALOG_PAGE_SIZE;

/** Aggregated facet options. Shared + durable. */
async function getFilters() {
  "use cache: remote";
  cacheLifeForProfile("hours", "max");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}

const NEW_BREADCRUMBS = [
  { name: "Home", uri: "/", current: false },
  { name: "New Arrivals", uri: "/new", current: true },
] as const;

/**
 * Sync shell with page 1 of newest products in the HTML. No `searchParams`,
 * no Suspense — same contract as `app/shop/page.tsx`. `/new` stays
 * newest-first; branding sort does not apply here.
 */
export const instant = true;

export default function Page() {
  return (
    <>
      <BreadcrumbJsonLD
        items={NEW_BREADCRUMBS.map((crumb) => ({
          name: crumb.name,
          href: crumb.uri,
        }))}
      />
      <CollectionHeader
        name="New Arrivals"
        description="Discover our latest products"
        breadcrumbs={[...NEW_BREADCRUMBS]}
        childBasePath="/collections"
      />
      <NewProductsShell />
    </>
  );
}

async function NewProductsShell() {
  const filter = buildProductListFilter(
    { ...DEFAULT_FILTER_VALUES, page: 1 },
    {
      isNew: true,
      defaultSort: "CREATED_AT" satisfies SortKeyType,
    },
  );
  const [productsResult, productFilter] = await Promise.all([
    getCachedCatalogPage(filter, 1, PER_PAGE, {
      kind: "route",
      route: "new",
    }),
    getFilters(),
  ]);
  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={1}
      itemsPerPage={PER_PAGE}
      isNew
    />
  );
}
