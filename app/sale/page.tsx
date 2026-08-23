import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { TAG } from "@/lib/cache-tags";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  normalizeFilterKey,
  parseSearchParams,
  type SortKeyType,
} from "@/components/headkit-ui/collection/utils";
import { CollectionProductsSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";
import { getBranding } from "@/lib/branding";
import { storefrontUrl } from "@/lib/make-metadata";

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
    const { storeSettings } = await getBranding();
    return {
      title: "Sale",
      alternates: {
        canonical: storefrontUrl("/sale", storeSettings.domain),
      },
    };
  } catch {
    return {
      title: "Sale",
      alternates: { canonical: storefrontUrl("/sale") },
    };
  }
}

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = CATALOG_PAGE_SIZE;

/**
 * Durable, shared catalog read keyed on a STABLE normalized filter key + page
 * (never raw searchParams). Sale items are a public catalog read (no PII/auth),
 * so a remote cache is safe (mirrors /shop, plan 03-04).
 */
async function getCatalogPage(filterKey: string, page: number) {
  "use cache: remote";
  cacheLife("hours");
  // route:sale = the {onSale} FILTER landing (no collection entity). Use
  // route:sale NOT collection:sale — a real category slug named "sale" must not
  // cross-invalidate this landing (threat T-09.5-13). catalog:${filterKey} keeps
  // the per-filter self-heal (internal, not a contract tag).
  cacheTag(TAG.route("sale"), `catalog:${filterKey}`);
  const filter = JSON.parse(filterKey) as Parameters<
    typeof sdk.collections.list
  >[0];
  return sdk.collections.list(filter, page, PER_PAGE);
}

/** Aggregated facet options. Shared + durable. */
async function getFilters() {
  "use cache: remote";
  cacheLife("hours");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}

/**
 * Dynamic island: reads searchParams (must live inside <Suspense> under
 * cacheComponents). Preserves the onSale filter for this route.
 */
async function LandingResults({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const page = parsed.page;

  const { branding } = await getBranding();
  const filter = buildProductListFilter(parsed, {
    onSale: true,
    defaultSort: branding.defaultCollectionSort as SortKeyType,
  });
  const filterKey = normalizeFilterKey(filter);

  const [productsResult, productFilter] = await Promise.all([
    getCatalogPage(filterKey, page),
    getFilters(),
  ]);

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={PER_PAGE}
      onSale
    />
  );
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({ searchParams }: Props) {
  return (
    <>
      {/* Static shell — outside <Suspense>, cacheable */}
      <CollectionHeader
        name="Sale"
        description="Shop our sale items with great discounts!"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Sale", uri: "/sale", current: true },
        ]}
      />
      {/* Dynamic grid — Instant Navigation shell streams results under Suspense. */}
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <LandingResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}
