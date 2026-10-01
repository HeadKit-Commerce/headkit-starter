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
} from "@/components/headkit-ui/collection/utils";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { getBranding } from "@/lib/branding";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";

const FEATURED_DESCRIPTION =
  "Browse the featured products chosen for this store. Filter the selection by category, price, and availability.";

/**
 * Canonical origin comes from the RUNTIME store domain, not the build-time
 * `NEXT_PUBLIC_FRONTEND_URL`. See `app/sale/page.tsx`.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { storeSettings, seoSettings, branding } = await getBranding();
    return await makeSeoMetadata(null, {
      title: "Featured Products",
      description: FEATURED_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl("/featured", storeSettings.domain),
      siteUrl: storeSettings.domain,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: branding?.iconUrl ?? undefined,
    });
  } catch {
    return await makeSeoMetadata(null, {
      title: "Featured Products",
      description: FEATURED_DESCRIPTION,
      canonical: storefrontUrl("/featured"),
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

const FEATURED_BREADCRUMBS = [
  { name: "Home", uri: "/", current: false },
  { name: "Featured Products", uri: "/featured", current: true },
] as const;

/**
 * Sync shell. Featured products stay on `menu_order` / `asc` until the
 * shopper picks a sort (`defaultSort: "FEATURED"`). The `featured` prop keeps
 * later client fetches (page, sort) on the same set.
 */
export const instant = true;

export default function Page() {
  return (
    <>
      <BreadcrumbJsonLD
        items={FEATURED_BREADCRUMBS.map((crumb) => ({
          name: crumb.name,
          href: crumb.uri,
        }))}
      />
      <CollectionHeader
        name="Featured Products"
        description="Discover our handpicked selection of featured products"
        breadcrumbs={[...FEATURED_BREADCRUMBS]}
        childBasePath="/collections"
      />
      <FeaturedProductsShell />
    </>
  );
}

async function FeaturedProductsShell() {
  const filter = buildProductListFilter(
    { ...DEFAULT_FILTER_VALUES, page: 1 },
    { featured: true, defaultSort: "FEATURED" },
  );
  const [productsResult, productFilter] = await Promise.all([
    getCachedCatalogPage(filter, 1, PER_PAGE, {
      kind: "route",
      route: "featured",
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
      featured
    />
  );
}
