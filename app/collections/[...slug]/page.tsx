import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  buildBreadcrumbFromCategory,
  normalizeFilterKey,
  encodeFilterSlug,
  decodeFilterSlug,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";

/** Satisfies Cache Components: `generateStaticParams` must not return []. Never a real category slug. */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Parse the catch-all slug into category path and optional filter slug.
 * URL formats:
 *   /collections/hoodies                            → no filter
 *   /collections/hoodies/f/color.blue.red_size.l   → filtered
 *   /collections/clothing/hoodies/f/color.red       → nested category + filter
 */
function parseCollectionSlug(slug: string[]): {
  categorySlug: string;
  filterSlug: string | undefined;
  categoryBasePath: string;
} {
  const fIndex = slug.indexOf("f");
  if (fIndex > 0 && slug[fIndex + 1]) {
    const categorySegments = slug.slice(0, fIndex);
    return {
      categorySlug: categorySegments[categorySegments.length - 1]!,
      filterSlug: slug[fIndex + 1]!,
      categoryBasePath: `/collections/${categorySegments.join("/")}`,
    };
  }
  return {
    categorySlug: slug[slug.length - 1]!,
    filterSlug: undefined,
    categoryBasePath: `/collections/${slug.join("/")}`,
  };
}

/**
 * Params-only category read for the STATIC shell (CollectionHeader + breadcrumb
 * JSON-LD). Cached (`'use cache'`) because it depends only on the route param,
 * never on searchParams — so it belongs in the cacheable, Suspense-free shell.
 * Drives both generateMetadata and the page header.
 */
async function getCategoryData(categorySlug: string) {
  "use cache";
  // 2-week stale / 1h revalidate — safety net if webhooks fail.
  cacheLife({ stale: 60 * 60 * 24 * 14, revalidate: 60 * 60, expire: 60 * 60 * 24 * 14 });
  // headkit:collections is sent by WordPress on any product or category change.
  // headkit:collection:${categorySlug} is sent on category-specific changes.
  cacheTag(`headkit:collection:${categorySlug}`, "headkit:collections");

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

async function CollectionProductsServer({
  categorySlug,
  productFilter,
  searchParams,
  filterSlug,
  categoryBasePath,
}: {
  categorySlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  filterSlug: string | undefined;
  categoryBasePath: string;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  // Path-decoded attributes (filter-slug routing) take precedence over legacy
  // search params.
  const initialFilterValues = filterSlug ? decodeFilterSlug(filterSlug) : undefined;
  const attributes: Record<string, string[]> = initialFilterValues ?? (() => {
    const spAttrs: Record<string, string[]> = {};
    productFilter.attributes?.forEach((attr) => {
      if (!attr?.slug) return;
      const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
      if (values.length) spAttrs[attr.slug] = values;
    });
    return spAttrs;
  })();

  // Build the category-scoped filter from the (path- or query-derived) facets,
  // then derive a STABLE normalized cache key so the durable remote catalog
  // cache (`getCatalogPage`) is shared across equivalent filter selections.
  const filter = buildProductListFilter(
    {
      ...DEFAULT_FILTER_VALUES,
      categories: sp.categories?.split(",").filter(Boolean) ?? [],
      brands: sp.brands?.split(",").filter(Boolean) ?? [],
      attributes,
      instock: sp.instock === "true",
      sort: (sp.sort ?? "") as SortKeyType | "",
      page,
    },
    { categorySlug },
  );
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
      categoryBasePath={categoryBasePath}
      {...(initialFilterValues ? { initialFilterValues } : {})}
    />
  );
}

function CollectionProductsSkeleton() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex w-full items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="px-5 md:px-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  try {
    const categories = await sdk.collections.getCategories();
    const paths = categories.flatMap((cat) => {
      const paths: { slug: string[] }[] = [{ slug: [cat.slug] }];
      cat.children?.forEach((child) => {
        if (child?.slug) paths.push({ slug: [cat.slug, child.slug] });
      });
      return paths;
    });
    if (paths.length > 0) return paths;
  } catch {
    /* API unreachable at build — fall through */
  }
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  const { categorySlug, filterSlug, categoryBasePath } =
    parseCollectionSlug(slug);
  if (!categorySlug) return {};
  try {
    const { category } = await getCategoryData(categorySlug);
    if (!category) return {};
    const metadata = makeSeoMetadata(category.seo, {
      title: category.name,
      // Templated per-entity floor when both Yoast SEO and the category's own
      // description are absent (FE-09 / D-04). Real category.seo still wins.
      description:
        category.description ||
        seoFallbackDescription("category", category.name),
    });
    // Filtered URLs point back to the unfiltered collection as canonical.
    if (filterSlug) {
      metadata.alternates = { canonical: categoryBasePath };
    }
    return metadata;
  } catch {
    return {};
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();
  const { categorySlug, filterSlug, categoryBasePath } =
    parseCollectionSlug(slug);
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

  // Legacy redirect: ?pa_color=red,blue → /collections/hoodies/f/color.blue.red (308)
  // Path-based filter-slug routing (staging). Runs OUTSIDE the try/catch above
  // because permanentRedirect throws NEXT_REDIRECT internally — a catch here
  // would swallow it (phase-5 redirect-correctness rule).
  if (!filterSlug) {
    const sp = await searchParams;
    const legacyAttributes: Record<string, string[]> = {};
    productFilter.attributes?.forEach((attr) => {
      if (!attr?.slug) return;
      const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
      if (values.length) legacyAttributes[attr.slug] = values;
    });
    const legacySlug = encodeFilterSlug({
      ...DEFAULT_FILTER_VALUES,
      attributes: legacyAttributes,
    });
    if (legacySlug) {
      permanentRedirect(`${categoryBasePath}/f/${legacySlug}`);
    }
  }

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
      {/* Dynamic grid — reads searchParams + filter-slug, streamed under Suspense */}
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <CollectionProductsServer
          categorySlug={categorySlug}
          productFilter={productFilter}
          searchParams={searchParams}
          filterSlug={filterSlug}
          categoryBasePath={categoryBasePath}
        />
      </Suspense>
    </>
  );
}
