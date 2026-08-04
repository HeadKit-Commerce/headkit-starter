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
  title: "Sale",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/sale` },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Durable, shared catalog read keyed on a STABLE normalized filter key + page
 * (never raw searchParams). Sale items are a public catalog read (no PII/auth),
 * so a remote cache is safe (mirrors /shop, plan 03-04).
 */
async function getCatalogPage(filterKey: string, page: number) {
  "use cache: remote";
  cacheLife("minutes");
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
  cacheLife("minutes");
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

  const filter = buildProductListFilter(parsed, { onSale: true });
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
