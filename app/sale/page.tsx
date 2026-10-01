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

/**
 * Long enough for the meta-description audit (Ahrefs flags copy under ~120
 * characters) and specific enough to describe the landing.
 */
const SALE_DESCRIPTION =
  "Shop products currently on sale. Compare discounted prices, filter by category, and see what is in stock.";

/**
 * Canonical origin comes from the RUNTIME store domain, not the build-time
 * `NEXT_PUBLIC_FRONTEND_URL` — a custom domain attached without a redeploy
 * leaves that env naming the old `*.headkit.app` host, which would put a
 * cross-host canonical on a route `app/sitemap.ts` advertises under the
 * customer's apex (it emits every `<loc>` from `resolveSiteUrl(store.domain)`).
 *
 * `getBranding()` is `"use cache: remote"`, so reading it here costs this route
 * no static rendering: the metadata read stays cacheable exactly as the sibling
 * `app/shop/page.tsx` already does.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { storeSettings, seoSettings, branding } = await getBranding();
    return await makeSeoMetadata(null, {
      title: "Sale",
      description: SALE_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl("/sale", storeSettings.domain),
      siteUrl: storeSettings.domain,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: branding?.iconUrl ?? undefined,
    });
  } catch {
    return await makeSeoMetadata(null, {
      title: "Sale",
      description: SALE_DESCRIPTION,
      canonical: storefrontUrl("/sale"),
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

const SALE_BREADCRUMBS = [
  { name: "Home", uri: "/", current: false },
  { name: "Sale", uri: "/sale", current: true },
] as const;

/**
 * Instant Navigation (Next.js 16.3): sync default export. The header and the
 * page-1 grid both commit with the App Shell — this route reads no
 * `searchParams` and has no Suspense boundary, so a crawler's document is the
 * finished HTML rather than a stream held open until the catalog read returns.
 *
 * `?page=` / `?sort=` / `?price_*` / `?instock=` are applied in the browser by
 * `CollectionProvider`'s mount effect. None of those URLs is canonical.
 */
export const instant = true;

export default function Page() {
  return (
    <>
      <BreadcrumbJsonLD
        items={SALE_BREADCRUMBS.map((crumb) => ({
          name: crumb.name,
          href: crumb.uri,
        }))}
      />
      <CollectionHeader
        name="Sale"
        description="Shop our sale items with great discounts!"
        breadcrumbs={[...SALE_BREADCRUMBS]}
        childBasePath="/collections"
      />
      <SaleProductsShell />
    </>
  );
}

/** Page 1 of on-sale products, in the store's default order, in the static shell. */
async function SaleProductsShell() {
  const { branding } = await getBranding();
  const filter = buildProductListFilter(
    { ...DEFAULT_FILTER_VALUES, page: 1 },
    {
      onSale: true,
      defaultSort: branding.defaultCollectionSort as SortKeyType,
    },
  );
  const [productsResult, productFilter] = await Promise.all([
    getCachedCatalogPage(filter, 1, PER_PAGE, {
      kind: "route",
      route: "sale",
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
      onSale
    />
  );
}
