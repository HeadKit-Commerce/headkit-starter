import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { TAG } from "@/lib/cache-tags";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { buildProductListFilter } from "@/components/headkit-ui/collection/utils";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { makeSeoMetadata } from "@/lib/make-metadata";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import {
  CollectionPageSkeleton,
  CollectionProductsSkeleton,
} from "@/components/headkit-ui/skeletons/collection-page-skeleton";

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = 24;

/**
 * Params-only brand shell (header + facet options). Uses durable `"use cache"`
 * so Cache Components can prerender it into the HTML shell. Mirrors collections
 * `getCategoryData`.
 */
async function getBrandShell(brandSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.brand(brandSlug), TAG.brands, "catalog:filters");
  const [brand, productFilter] = await Promise.all([
    sdk.brands.get(brandSlug),
    sdk.collections.getFilters(),
  ]);
  return { brand, productFilter };
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

  const filter = buildProductListFilter(
    {
      categories: sp.categories?.split(",").filter(Boolean) ?? [],
      brands: [brandSlug],
      attributes: {},
      instock: sp.instock === "true",
      sort: (sp.sort ?? "") as SortKeyType | "",
      page,
    },
    { brandSlug },
  );

  const [{ productFilter }, productsResult] = await Promise.all([
    getBrandShell(brandSlug),
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

/**
 * Prerender known brand PLPs so awaiting `params` under Suspense is valid
 * under Cache Components (blocking-route docs: generateStaticParams).
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  try {
    // perPage capped at 100 — headkit/v2/brands 400s above 100 (REST max arg).
    const brandsRes = await sdk.brands.list({ perPage: 100 });
    const paths = brandsRes.brands
      .map((brand) => brand?.slug)
      .filter((slug): slug is string => Boolean(slug))
      .map((slug) => ({ slug: [slug] }));
    if (paths.length > 0) return paths;
  } catch {
    /* Brands API unreachable at build — fall through */
  }
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  const brandSlug = slug[slug.length - 1];
  if (!brandSlug) return {};
  try {
    const { brand } = await getBrandShell(brandSlug);
    if (!brand) return {};
    return makeSeoMetadata(brand.seo, {
      title: brand.name,
      description: brand.description,
    });
  } catch {
    return {};
  }
}

/**
 * Instant Navigation (Next.js 16.3): keep the route segment sync so Partial
 * Prefetching can ship an App Shell immediately. Awaiting `params` / brand
 * data in the default export blocks client navigations (same as collections).
 *
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({ params, searchParams }: Props) {
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
