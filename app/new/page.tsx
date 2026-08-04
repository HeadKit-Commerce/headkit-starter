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
} from "@/components/headkit-ui/collection/utils";
import { CollectionProductsSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";

export const metadata: Metadata = {
  title: "New Arrivals",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/new` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Durable, shared catalog read keyed on a STABLE normalized filter key + page
 * (never raw searchParams). New-arrival items are a public catalog read (no
 * PII/auth), so a remote cache is safe (mirrors /shop, plan 03-04).
 */
async function getCatalogPage(filterKey: string, page: number) {
  "use cache: remote";
  cacheLife("minutes");
  // route:new = the {isNew} FILTER landing (no collection entity). Use route:new
  // NOT collection:new — a real category slug named "new" must not cross-
  // invalidate this landing (threat T-09.5-13). catalog:${filterKey} keeps the
  // per-filter self-heal (internal, not a contract tag).
  cacheTag(TAG.route("new"), `catalog:${filterKey}`);
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
 * cacheComponents). Preserves the isNew filter for this route.
 */
async function LandingResults({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const page = parsed.page;

  const filter = buildProductListFilter(parsed, { isNew: true });
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
      isNew
    />
  );
}

export default function Page({ searchParams }: Props) {
  return (
    <>
      {/* Static shell — outside <Suspense>, cacheable */}
      <CollectionHeader
        name="New Arrivals"
        description="Discover our latest products"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "New Arrivals", uri: "/new", current: true },
        ]}
      />
      {/* Dynamic grid — Instant Navigation shell streams results under Suspense. */}
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <LandingResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}
