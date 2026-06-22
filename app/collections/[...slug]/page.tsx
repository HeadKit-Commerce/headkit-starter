import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import {
  buildProductListFilter,
  buildBreadcrumbFromCategory,
  normalizeFilterKey,
  parseSearchParams,
} from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Params-only category read for the STATIC shell (CollectionHeader + breadcrumb
 * JSON-LD). Cached (`'use cache'`) because it depends only on the route param,
 * never on searchParams — so it belongs in the cacheable, Suspense-free shell.
 * Drives both generateMetadata and the page header.
 */
async function getCategoryData(categorySlug: string) {
  "use cache";

  const [category, productFilter] = await Promise.all([
    sdk.collections.getCategory(categorySlug),
    sdk.collections.getFilters(categorySlug),
  ]);

  return { category, productFilter };
}

/**
 * Durable, shared catalog page read for the PLP grid. Keyed on a STABLE
 * normalized filter key + page (never raw searchParams — that would explode the
 * key space and re-evaluate per request on Fluid Compute). Catalog reads are
 * public (no PII/auth), so a remote cache is safe (mirrors /shop, plan 03-04).
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];
  if (!categorySlug) return {};
  try {
    const { category } = await getCategoryData(categorySlug);
    if (!category) return {};
    return makeSeoMetadata(category.seo, {
      title: category.name,
      // Templated per-entity floor when both Yoast SEO and the category's own
      // description are absent (FE-09 / D-04). Real category.seo still wins.
      description:
        category.description ||
        seoFallbackDescription("category", category.name),
    });
  } catch {
    return {};
  }
}

/**
 * Dynamic island: reads searchParams (must live inside <Suspense> under
 * cacheComponents). Builds the filter (scoped to this category), derives a
 * stable cache key, fetches the cached catalog page, and hands the initial
 * products to the client grid. The category's own facets come from the cached
 * shell read via {@link getCategoryData} (passed in as `productFilter`).
 */
async function ProductResults({
  categorySlug,
  productFilter,
  searchParams,
}: {
  categorySlug: string;
  productFilter: Awaited<ReturnType<typeof getCategoryData>>["productFilter"];
  searchParams: Props["searchParams"];
}) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const page = parsed.page;

  const filter = buildProductListFilter(parsed, { categorySlug });
  const filterKey = normalizeFilterKey(filter);

  const productsResult = await getCatalogPage(filterKey, page);

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={PER_PAGE}
      categorySlug={categorySlug}
    />
  );
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];
  if (!categorySlug) return notFound();

  // Params-only cached read drives the STATIC shell (no searchParams here).
  // Fetch failure (SDK/transport) degrades to a 404, same as a missing
  // category — the try/catch wraps only the data read, not JSX, so it avoids
  // the "construct JSX within try/catch" lint rule.
  let data: Awaited<ReturnType<typeof getCategoryData>>;
  try {
    data = await getCategoryData(categorySlug);
  } catch {
    return notFound();
  }
  const { category, productFilter } = data;
  if (!category) return notFound();

  const breadcrumbs = buildBreadcrumbFromCategory(category);

  return (
    <>
      {/* Static shell — outside <Suspense>, cacheable. Preserves 03-06 JSON-LD. */}
      <BreadcrumbJsonLD
        items={breadcrumbs.map((b) => ({
          name: b.name,
          href: b.uri,
        }))}
      />
      <CollectionHeader
        name={category.name}
        description={category.description}
        breadcrumbs={breadcrumbs}
        {...(category.thumbnail ? { thumbnail: category.thumbnail } : {})}
        {...(category.children?.length
          ? { children: category.children }
          : {})}
      />
      {/* Dynamic grid — reads searchParams, streamed under Suspense */}
      <Suspense fallback={<CollectionPageSkeleton variant="collection" />}>
        <ProductResults
          categorySlug={categorySlug}
          productFilter={productFilter}
          searchParams={searchParams}
        />
      </Suspense>
    </>
  );
}
