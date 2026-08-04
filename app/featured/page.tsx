import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  normalizeFilterKey,
  parseSearchParams,
} from "@/components/headkit-ui/collection/utils";
import { CollectionProductsSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";

export const metadata: Metadata = {
  title: "Featured Products",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/featured` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Durable, shared catalog read keyed on a STABLE normalized filter key + page
 * (never raw searchParams). Featured items are a public catalog read (no
 * PII/auth), so a remote cache is safe (mirrors /shop, plan 03-04).
 */
async function getCatalogPage(filterKey: string, page: number) {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(`catalog:${filterKey}`);
  const filter = JSON.parse(filterKey) as Parameters<
    typeof sdk.collections.list
  >[0];
  return sdk.collections.list(filter, page, PER_PAGE);
}

/** Aggregated facet options. Shared + durable. */
async function getFilters() {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}

/**
 * Dynamic island: reads searchParams (must live inside <Suspense> under
 * cacheComponents). Featured = menu_order/asc ordering (the route's existing
 * filter); folded into the built filter before keying so the cache stays
 * correct.
 */
async function LandingResults({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const page = parsed.page;

  const filter = buildProductListFilter(parsed);
  // Preserve the route's existing featured ordering (was set after build in the
  // pre-Suspense page). A user-selected sort still wins via filterValues.sort.
  if (!parsed.sort) {
    filter.orderby = "menu_order";
    filter.order = "asc";
  }
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
    />
  );
}

export default function Page({ searchParams }: Props) {
  return (
    <>
      {/* Static shell — outside <Suspense>, cacheable */}
      <CollectionHeader
        name="Featured Products"
        description="Discover our handpicked selection of featured products"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Featured Products", uri: "/featured", current: true },
        ]}
      />
      {/* Dynamic grid — Instant Navigation shell streams results under Suspense. */}
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <LandingResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}
