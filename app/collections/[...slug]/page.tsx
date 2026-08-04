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
import {
  makeSeoMetadata,
  seoFallbackDescription,
  resolveStoreName,
} from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";
import {
  CollectionPageSkeleton,
  CollectionProductsSkeleton,
} from "@/components/headkit-ui/skeletons/collection-page-skeleton";

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
 * Params-keyed category read for the Instant Navigation shell.
 * Cached (`'use cache'`) so runtime prefetch (`prefetch={true}` on category
 * links) can resolve header/breadcrumb/children before click. Must still be
 * awaited inside `<Suspense>` — awaiting `params` in the default export blocks
 * the App Shell under Partial Prefetching (Next.js 16.3 Instant Navigation).
 */
async function getCategoryData(categorySlug: string) {
  "use cache";
  // 2-week stale / 1h revalidate — safety net if webhooks fail.
  cacheLife({
    stale: 60 * 60 * 24 * 14,
    revalidate: 60 * 60,
    expire: 60 * 60 * 24 * 14,
  });
  // headkit:collections is sent by WordPress on any product or category change.
  // headkit:collection:${categorySlug} is sent on category-specific changes.
  cacheTag(TAG.collection(categorySlug), TAG.collections);

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
  // TAG.catalogCat(slug) (= headkit:catalog:cat:<slug>) lets a product/category
  // edit invalidate exactly this category's PLP grid + its prebuilt Tier-1 color
  // pages via revalidateTag('headkit:catalog:cat:<slug>') — bounded blast radius,
  // no whole-catalog wildcard (important for slow WP). The inline
  // catalog:<filterKey> grid key stays for per-filter granularity (not a contract
  // tag — internal to the self-healing minutes remote cache).
  cacheTag(TAG.catalogCat(categorySlug), `catalog:${filterKey}`);
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
  // searchParams MUST be awaited inside this Suspense child — never in the
  // page shell. Awaiting them in `Page` opts the whole segment dynamic under
  // Cache Components, so the CDN seals `loading.tsx` (full-page skeleton) as
  // the HTML shell and every HIT flashes skeleton before content streams.
  const sp = await searchParams;

  // Legacy redirect: fold query-string facets into the path form (308).
  // Lives here (not in `Page`) for the same searchParams reason. Brand is
  // path-encoded now (06.1), so old `?brands=` URLs canonicalize into the path.
  if (!filterSlug) {
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
    const [{ category, productFilter }, { storeSettings }] = await Promise.all([
      getCategoryData(categorySlug),
      getBranding(),
    ]);
    if (!category) return {};
    const siteName = resolveStoreName(storeSettings.name);

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
            brandName = brandsRes.brands.find(
              (b) => b.slug === brandSlug,
            )?.name;
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
        const description = facetDescription(
          category.name,
          facetLabel,
          storeSettings.name,
        );
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
            siteName,
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
        seoFallbackDescription("category", category.name, storeSettings.name),
      ...(storeSettings.name != null ? { storeName: storeSettings.name } : {}),
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

/**
 * Instant Navigation (Next.js 16.3): keep the route segment sync so Partial
 * Prefetching can ship an App Shell immediately. Awaiting `params` / category
 * data in the default export blocks client navigations (blank wait on click).
 * Stream via Suspense; `'use cache'` category reads pop in early when links use
 * `prefetch={true}` (see InstantLink / SubcategoryCarousel).
 *
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<CollectionPageSkeleton />}>
      <CollectionRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CollectionRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();
  const { categorySlug, filterSlug, categoryBasePath } =
    parseCollectionSlug(slug);
  if (!categorySlug) return notFound();

  // Do NOT catch→notFound here: the SDK returns null (never throws) for a
  // genuinely missing category, so a *thrown* error is always transport/infra
  // — e.g. a transient WooCommerce 429. Swallowing it into notFound() bakes a
  // sticky 404 into the route cache (14-day stale). Let it propagate: Next then
  // serves the last good render and retries. Genuine 404s use the null check.
  const { category, productFilter } = await getCategoryData(categorySlug);
  if (!category) return notFound();

  const breadcrumbs = buildBreadcrumbFromCategory(category);

  return (
    <>
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
        {...(category.children?.length ? { children: category.children } : {})}
      />
      {/* Nested Suspense: header (params + use cache) can commit while
          searchParams-driven catalog streams in. */}
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
