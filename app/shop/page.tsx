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
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { CollectionProductsSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import type { ProductCategoryDetail } from "@headkit/sdk";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { seoSettings, storeSettings } = await getBranding();
    return makeSeoMetadata(null, {
      title: "Shop",
      description: "Browse our full product catalog.",
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/shop` : "/shop",
    });
  } catch {
    return makeSeoMetadata(null, {
      title: "Shop",
      canonical: SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/shop` : "/shop",
    });
  }
}

interface Props {
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Root product categories for the Shop header carousel (same SubcategoryCarousel
 * as parent collection pages). Cached so Instant Navigation / runtime prefetch
 * can resolve it with the shared App Shell.
 */
/** WooCommerce default category — never show as a Shop carousel tile. */
function isUncategorizedCategory(cat: ProductCategoryDetail): boolean {
  const slug = cat.slug.trim().toLowerCase();
  return slug === "uncategorized" || slug === "uncategorised";
}

async function getRootCategories(): Promise<ProductCategoryDetail[]> {
  "use cache";
  cacheLife({
    stale: 60 * 60 * 24 * 14,
    revalidate: 60 * 60,
    expire: 60 * 60 * 24 * 14,
  });
  cacheTag(TAG.collections);
  const categories = await sdk.collections.getCategories();
  return categories.filter((cat) => !isUncategorizedCategory(cat));
}

/**
 * Durable, shared catalog read for the PLP. Keyed on a STABLE normalized
 * filter key + page (never raw searchParams — that would explode the cache
 * key and re-evaluate per request on Fluid Compute). Filters are public
 * catalog reads (no PII/auth), so a remote cache is safe.
 */
async function getCatalogPage(filterKey: string, page: number) {
  "use cache: remote";
  cacheLife("minutes");
  // route:shop = WP shop-landing edit invalidation; catalog:${filterKey} keeps
  // the per-filter self-heal (internal, not a contract tag). NOT collection:shop.
  cacheTag(TAG.route("shop"), `catalog:${filterKey}`);
  const filter = JSON.parse(filterKey) as Parameters<
    typeof sdk.collections.list
  >[0];
  return sdk.collections.list(filter, page, PER_PAGE);
}

/** Aggregated facet options (categories/attributes/price bounds). Shared + durable. */
async function getFilters() {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}

/**
 * Shop header with top-level category carousel. `'use cache'` via
 * getRootCategories — safe outside Suspense under Cache Components.
 */
async function ShopHeader() {
  const rootCategories = await getRootCategories();
  return (
    <CollectionHeader
      name="Shop"
      breadcrumbs={[
        { name: "Home", uri: "/", current: false },
        { name: "Shop", uri: "/shop", current: true },
      ]}
      {...(rootCategories.length > 0 ? { children: rootCategories } : {})}
    />
  );
}

/**
 * Dynamic island: reads searchParams (must live inside <Suspense> under
 * cacheComponents). Builds the filter, derives a stable cache key, fetches
 * the cached catalog page, and hands the initial products to the client grid.
 */
async function ProductResults({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const page = parsed.page;

  // price_min/price_max + instock are read directly off `parsed` by
  // buildProductListFilter; no need to re-pass them as options.
  const filter = buildProductListFilter(parsed);
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

/**
 * Instant Navigation (Next.js 16.3): sync default export. Cached Shop header
 * (incl. root category carousel) can commit with the App Shell; searchParams-
 * driven grid streams under Suspense.
 */
export const instant = true;

export default function Page({ searchParams }: Props) {
  return (
    <>
      <ShopHeader />
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <ProductResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}
