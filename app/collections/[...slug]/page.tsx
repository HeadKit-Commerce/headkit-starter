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
  isIndexableFacet,
  isColorAttrSlug,
  facetTitle,
  facetDescription,
  formatOptionName,
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
async function getCatalogPage(
  filterKey: string,
  page: number,
  categorySlug: string,
) {
  "use cache: remote";
  cacheLife("minutes");
  // catalog:cat:<slug> lets a product/category edit invalidate exactly this
  // category's PLP grid + its prebuilt Tier-1 color pages via
  // revalidateTag('catalog:cat:<slug>') — bounded blast radius, no whole-catalog
  // wildcard (important for slow WP). catalog:<filterKey> stays for per-filter granularity.
  cacheTag(`catalog:cat:${categorySlug}`, `catalog:${filterKey}`);
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

  // Path-decoded attributes + brand (filter-slug routing) take precedence over
  // legacy search params. Brand is path-encoded now (06.1).
  const decoded = filterSlug ? decodeFilterSlug(filterSlug) : undefined;
  const initialFilterValues =
    decoded && Object.keys(decoded.attributes).length > 0
      ? decoded.attributes
      : undefined;
  const initialBrands =
    decoded && decoded.brands.length > 0 ? decoded.brands : undefined;

  const attributes: Record<string, string[]> = decoded
    ? decoded.attributes
    : (() => {
        const spAttrs: Record<string, string[]> = {};
        productFilter.attributes?.forEach((attr) => {
          if (!attr?.slug) return;
          const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
          if (values.length) spAttrs[attr.slug] = values;
        });
        return spAttrs;
      })();

  // Brand from the path slug (preferred) else legacy query param.
  const brands = decoded
    ? decoded.brands
    : (sp.brands?.split(",").filter(Boolean) ?? []);

  // Build the category-scoped filter from the (path- or query-derived) facets,
  // then derive a STABLE normalized cache key so the durable remote catalog
  // cache (`getCatalogPage`) is shared across equivalent filter selections.
  const filter = buildProductListFilter(
    {
      ...DEFAULT_FILTER_VALUES,
      categories: sp.categories?.split(",").filter(Boolean) ?? [],
      brands,
      attributes,
      instock: sp.instock === "true",
      sort: (sp.sort ?? "") as SortKeyType | "",
      page,
    },
    { categorySlug },
  );
  const filterKey = normalizeFilterKey(filter);

  const productsResult = await getCatalogPage(filterKey, page, categorySlug);

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
      {...(initialBrands ? { initialBrands } : {})}
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

/**
 * Walk the category tree (any depth) yielding every category with its full
 * path segments. Used by both generateStaticParams and the sitemap so Tier-1
 * color URLs are emitted for nested categories too (R2).
 */
function walkCategoryPaths(
  categories: { slug: string; children?: { slug: string }[] }[],
  parentSegments: string[] = [],
): { slug: string; segments: string[] }[] {
  const out: { slug: string; segments: string[] }[] = [];
  for (const cat of categories) {
    if (!cat?.slug) continue;
    const segments = [...parentSegments, cat.slug];
    out.push({ slug: cat.slug, segments });
    if (cat.children?.length) {
      out.push(...walkCategoryPaths(cat.children, segments));
    }
  }
  return out;
}

/**
 * Encode a single-color filter slug (`color.<c>`) consistently with the URL
 * router via encodeFilterSlug. Returns "" for an empty color.
 */
function colorFilterSlug(color: string): string {
  if (!color) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    attributes: { pa_color: [color] },
  });
}

/**
 * Encode a single-brand filter slug (`brand.<b>`) consistently with the URL
 * router via encodeFilterSlug. Returns "" for an empty brand.
 */
function brandFilterSlug(brand: string): string {
  if (!brand) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    brands: [brand],
  });
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  try {
    const categories = await sdk.collections.getCategories();
    const nodes = walkCategoryPaths(categories);
    const paths: { slug: string[] }[] = [];

    // Base category params (all categories incl. nested).
    for (const node of nodes) {
      paths.push({ slug: node.segments });
    }

    // Tier-1 category×color params: color-only, single value, no blowup.
    // Fetch each category's present colors and emit one entry per color.
    const filterResults = await Promise.all(
      nodes.map((node) =>
        sdk.collections
          .getFilters(node.slug)
          .then((f) => ({ node, filters: f }))
          .catch(() => ({ node, filters: null })),
      ),
    );

    for (const { node, filters } of filterResults) {
      if (!filters) continue;
      const colorAttr = filters.attributes?.find((a) =>
        isColorAttrSlug(a?.slug ?? ""),
      );
      const seen = new Set<string>();
      for (const option of colorAttr?.options ?? []) {
        const slug = colorFilterSlug(option?.slug ?? "");
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        paths.push({ slug: [...node.segments, "f", slug] });
      }
    }

    // Tier-1 category×brand params (06.1): one single-brand entry per category
    // per brand. Brands are global (not exposed by getFilters), so emit the
    // cross-product cats × brands — still linear, no combo blowup.
    try {
      // perPage capped at 100 — headkit/v2/brands 400s above 100 (REST max arg).
      const brandsRes = await sdk.brands.list({ perPage: 100 });
      for (const node of nodes) {
        const seenBrand = new Set<string>();
        for (const brand of brandsRes.brands) {
          const slug = brandFilterSlug(brand?.slug ?? "");
          if (!slug || seenBrand.has(slug)) continue;
          seenBrand.add(slug);
          paths.push({ slug: [...node.segments, "f", slug] });
        }
      }
    } catch {
      /* brands API unreachable at build — color params still emitted */
    }

    if (paths.length > 0) return paths;
  } catch {
    /* API unreachable at build — fall through */
  }
  // Cache Components requires generateStaticParams to return ≥1 param.
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  const { categorySlug, filterSlug, categoryBasePath } =
    parseCollectionSlug(slug);
  if (!categorySlug) return {};
  try {
    const { category, productFilter } = await getCategoryData(categorySlug);
    if (!category) return {};

    // Tier-1 branch: a single-color URL (e.g. /collections/<cat>/f/color.red)
    // earns its OWN indexable identity — self-canonical, facet title/desc, and
    // robots index in prod. isIndexableFacet is the single source of truth so
    // on-demand single-color pages are SEO-correct too.
    if (filterSlug) {
      const decoded = decodeFilterSlug(filterSlug);
      const filterValues = {
        ...DEFAULT_FILTER_VALUES,
        attributes: decoded.attributes,
        brands: decoded.brands,
      };
      if (isIndexableFacet(filterValues)) {
        // Tier-1 facet is exactly one of: single color OR single brand (06.1).
        // Resolve the human display label for whichever dimension is engaged.
        let facetLabel: string;
        if (decoded.brands.length === 1) {
          const brandSlug = decoded.brands[0]!;
          // Resolve brand display name from the brands list; fall back to the slug.
          let brandName: string | undefined;
          try {
            // perPage capped at 100 — the headkit/v2/brands WP endpoint 400s
            // above 100 (REST arg maximum). 100 covers realistic brand counts.
            const brandsRes = await sdk.brands.list({ perPage: 100 });
            brandName = brandsRes.brands.find((b) => b.slug === brandSlug)?.name;
          } catch {
            brandName = undefined;
          }
          facetLabel = brandName ?? formatOptionName(brandSlug);
        } else {
          const colorSlug =
            decoded.attributes.pa_color?.[0] ??
            decoded.attributes.pa_colour?.[0] ??
            "";
          // Resolve the human display label from the category's own filter
          // options; fall back to title-casing the slug.
          const colorAttr = productFilter.attributes?.find((a) =>
            isColorAttrSlug(a?.slug ?? ""),
          );
          facetLabel =
            colorAttr?.options?.find((o) => o?.slug === colorSlug)?.name ??
            formatOptionName(colorSlug);
        }
        const selfCanonical = `${categoryBasePath}/f/${filterSlug}`;
        const isProduction = process.env.VERCEL_ENV === "production";
        const title = facetTitle(category.name, facetLabel);
        const description = facetDescription(category.name, facetLabel);
        return {
          title,
          description,
          alternates: { canonical: selfCanonical },
          robots: { index: isProduction, follow: isProduction },
          openGraph: {
            type: "website",
            title,
            description,
            url: selfCanonical,
            siteName: "HeadKit",
            ...(category.thumbnail ? { images: [category.thumbnail] } : {}),
          },
          twitter: {
            card: "summary_large_image",
            title,
            description,
          },
        };
      }
    }

    const metadata = makeSeoMetadata(category.seo, {
      title: category.name,
      // Templated per-entity floor when both Yoast SEO and the category's own
      // description are absent (FE-09 / D-04). Real category.seo still wins.
      description:
        category.description ||
        seoFallbackDescription("category", category.name),
    });
    // Tier-2: any other filtered URL points back to the unfiltered collection
    // as canonical (R1: base). Unfiltered category metadata is unchanged.
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

  // Legacy redirect: fold query-string facets into the path form (308).
  //   ?pa_color=red,blue        → /collections/hoodies/f/color.blue.red
  //   ?brands=velocity          → /collections/hoodies/f/brand.velocity  (06.1)
  //   ?pa_color=red&brands=acme → /collections/hoodies/f/brand.acme_color.red
  // Path-based filter-slug routing. Runs OUTSIDE the try/catch above because
  // permanentRedirect throws NEXT_REDIRECT internally — a catch here would
  // swallow it (phase-5 redirect-correctness rule). Brand is path-encoded now,
  // so old `?brands=` URLs canonicalize into the path (brand leaves the query).
  if (!filterSlug) {
    const sp = await searchParams;
    const legacyAttributes: Record<string, string[]> = {};
    productFilter.attributes?.forEach((attr) => {
      if (!attr?.slug) return;
      const values = sp[attr.slug]?.split(",").filter(Boolean) ?? [];
      if (values.length) legacyAttributes[attr.slug] = values;
    });
    const legacyBrands = sp.brands?.split(",").filter(Boolean) ?? [];
    const legacySlug = encodeFilterSlug({
      ...DEFAULT_FILTER_VALUES,
      attributes: legacyAttributes,
      brands: legacyBrands,
    });
    if (legacySlug) {
      // Preserve non-facet query state (price/sort/page) on the redirect target.
      const keep = new URLSearchParams();
      if (sp.q) keep.set("q", sp.q);
      if (sp.page && sp.page !== "1") keep.set("page", sp.page);
      if (sp.sort) keep.set("sort", sp.sort);
      if (sp.price_min) keep.set("price_min", sp.price_min);
      if (sp.price_max) keep.set("price_max", sp.price_max);
      if (sp.instock === "true") keep.set("instock", "true");
      const qs = keep.toString();
      permanentRedirect(
        `${categoryBasePath}/f/${legacySlug}${qs ? `?${qs}` : ""}`,
      );
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
