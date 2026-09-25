import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { cacheLifeForProfile } from "@/lib/cache-profile";
import { headkit as sdk } from "@/lib/sdk";
import { TAG } from "@/lib/cache-tags";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import {
  CollectionPageSkeleton,
  CollectionProductsSkeleton,
} from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = CATALOG_PAGE_SIZE;

/**
 * Aggregated facet options. Shared + durable — the SAME entry `/sale`, `/new`,
 * `/featured` and `/shop` read. Keyed on nothing, so one read serves every
 * brand.
 *
 * It does NOT live in {@link getBrandShell}, and that is the whole point. The
 * payload is the store-wide, un-scoped `product-filters` aggregation, which
 * costs the WordPress origin ~12 s to compute on a large catalogue. Inside a
 * per-brand plain `"use cache"` scope it was re-read at request time on every
 * brand-page view — a per-instance in-memory LRU does not persist across
 * requests in serverless — which measured as a 14–20 s dead click with every
 * cache header reporting HIT, because the cost lands in the streamed tail.
 * Out here, under `"use cache: remote"` keyed on nothing, it is one read per
 * deploy shared with the four sibling landing routes.
 */
async function getFilters() {
  "use cache: remote";
  cacheLifeForProfile("hours", "max");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}

/**
 * Params-only brand shell (header). Durable `"use cache: remote"` so Cache
 * Components can prerender it into the HTML shell AND so the read survives
 * across serverless instances. Mirrors collections `getCategoryData`.
 *
 * Keeps a finite `cacheLife("days")` and a plain literal, never
 * `cacheLifeForProfile`: this read feeds the route's 404 gate, so pinning it
 * at `max` would pin a wrong status code until the next deploy
 * (`lib/cache-profile-call-sites.test.ts`).
 */
async function getBrandShell(brandSlug: string) {
  "use cache: remote";
  cacheLife("days");
  cacheTag(TAG.brand(brandSlug), TAG.brands);
  return { brand: await sdk.brands.get(brandSlug) };
}

/**
 * Dynamic island: awaits `searchParams` inside Suspense (required under
 * cacheComponents — see nextjs blocking-route / next-cache-components skill).
 */
async function BrandProductsServer({
  brandSlug,
  searchParams,
}: {
  brandSlug: string;
  searchParams: Promise<Record<string, string>>;
}): Promise<ReactNode> {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const { branding } = await getBranding();

  const filter = buildProductListFilter(
    {
      categories: sp.categories?.split(",").filter(Boolean) ?? [],
      brands: [brandSlug],
      attributes: {},
      instock: sp.instock === "true",
      sort: (sp.sort ?? "") as SortKeyType | "",
      page,
    },
    {
      brandSlug,
      defaultSort: branding.defaultCollectionSort as SortKeyType,
    },
  );

  const [productFilter, productsResult] = await Promise.all([
    getFilters(),
    getCachedCatalogPage(filter, page, PER_PAGE, {
      kind: "brand",
      slug: brandSlug,
    }),
  ]);

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={PER_PAGE}
      brandSlug={brandSlug}
    />
  );
}

/** Page size for the brand walk — `headkit/v2/brands` 400s above 100. */
const BRAND_PER_PAGE = 100;

/**
 * Fail-safe bound on pages walked, mirroring `app/sitemap.ts`'s `MAX_LIST_PAGES`.
 * It exists so a provider reporting a wrong `totalPages` cannot spin the build,
 * not as a content limit.
 */
const BRAND_MAX_PAGES = 100;

/**
 * Prerender known brand PLPs so awaiting `params` under Suspense is valid
 * under Cache Components (blocking-route docs: generateStaticParams).
 *
 * PAGINATE, NEVER CAP — and this function capped until 2026-09-16.
 *
 * `perPage` maxes out at 100 because WordPress REST argument validation REJECTS
 * a larger ask (`'maximum' => 100` in `inc/rest-api/headkit-*.php`), and reading
 * ONE page was the wrong conclusion to draw from that: a store with more than
 * 100 brands silently lost every brand past the first page. The Bike Society
 * rehearsal store had 110, so 10 brand PLPs were advertised by `app/sitemap.ts`
 * — which walks the same endpoint to completion via `collectListPages` — and
 * never built. Measured there, 2026-09-16: `/brand/zipp` answered
 * `x-vercel-cache: MISS` at 4.25s while `/brand/abus` answered `PRERENDER` at
 * 1.15s. Identical defect, identical endpoint, fixed in one emitter and not the
 * other; `app/product-url-emitter-parity.test.ts` now fails if they diverge again.
 *
 * Terminator rules match `collectListPages`: stop on the endpoint's own
 * `totalPages` and on an EMPTY page, but NEVER on a short page — only the
 * endpoint knows whether it dropped a row, and treating a short page as the last
 * one is how a paginated walk quietly truncates.
 *
 * A failure mid-walk keeps what was already collected rather than discarding it:
 * prerendering 100 brands beats falling back to the placeholder and prerendering
 * none.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const slugs: string[] = [];

  try {
    for (let page = 1; page <= BRAND_MAX_PAGES; page++) {
      const result = await sdk.brands.list({ page, perPage: BRAND_PER_PAGE });
      const pageSlugs = result.brands
        .map((brand) => brand?.slug)
        .filter((slug): slug is string => Boolean(slug));
      slugs.push(...pageSlugs);

      if (result.brands.length === 0) break;
      const { totalPages } = result;
      if (!Number.isFinite(totalPages) || page >= totalPages) break;
    }
  } catch {
    /* Brands API unreachable at build — keep whatever the walk collected. */
  }

  if (slugs.length > 0) return slugs.map((slug) => ({ slug: [slug] }));
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return {};
  try {
    const [{ brand }, { seoSettings, storeSettings }] = await Promise.all([
      getBrandShell(brandSlug),
      getBranding(),
    ]);
    if (!brand) return {};
    return await makeSeoMetadata(brand.seo, {
      title: brand.name,
      description: brand.description,
      canonical: storefrontUrl(`/brand/${brandSlug}`, storeSettings.domain),
      siteUrl: storeSettings.domain,
      allowIndexing: seoSettings.allowIndexing,
    });
  } catch (error) {
    unstable_rethrow(error);
    return {};
  }
}

/**
 * Blocking route so `notFound()` can still set a real 404: under Cache
 * Components the response commits as 200 the moment a `<Suspense>` fallback
 * renders, and a `notFound()` raised inside the boundary only earns a `noindex`
 * meta tag. The existence check therefore runs in the default export, above the
 * boundary, forfeiting this route's App Shell. What that costs, what else can
 * commit the 200 first, and why `instant` is NOT one of those things live once
 * in "Setting a status code needs THREE conditions" in `apps/starter/AGENTS.md`.
 * `instant = false` is that section's declaration rule: this route blocks on a
 * cached read before it responds.
 */
export const instant = false;

export default async function Page({ params, searchParams }: Props) {
  // Pre-commit gate — only existence is hoisted; the product grid keeps
  // streaming behind the boundary below. `BrandRoute` repeats the checks and
  // the `"use cache"` shell read dedupes. A THROWN read still propagates (see
  // the note there): only a null brand is a genuine miss.
  //
  // The build-time placeholder is a 404 HERE rather than a skipped gate: it is
  // never served from a prerender, so skipping the gate let a runtime request
  // for it fall through to `BrandRoute`, whose `notFound()` fires below the
  // boundary — the exact soft 404 this route exists to close.
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) notFound();
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) notFound();
  const { brand } = await getBrandShell(brandSlug);
  if (!brand) notFound();

  return (
    <Suspense fallback={<CollectionPageSkeleton variant="brand" />}>
      <BrandRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BrandRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return notFound();

  // Do NOT catch→notFound on thrown errors: transport/infra failures must not
  // bake sticky 404s into the route cache. Genuine misses use the null check.
  const { brand } = await getBrandShell(brandSlug);
  if (!brand) return notFound();

  // Thumbnail only — no WP image fallback hunt when thumb is null.
  const thumbnailUrl = brand.thumbnail?.trim() || undefined;

  return (
    <>
      <BrandHeader
        name={brand.name}
        description={brand.description}
        {...(thumbnailUrl ? { thumbnailUrl } : {})}
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Brands", uri: "/brand", current: false },
          { name: brand.name, uri: `/brand/${brandSlug}`, current: true },
        ]}
      />
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <BrandProductsServer
          brandSlug={brandSlug}
          searchParams={searchParams}
        />
      </Suspense>
    </>
  );
}
