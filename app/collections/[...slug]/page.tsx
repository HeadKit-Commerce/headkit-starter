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
  encodeFilterSlug,
  decodeFilterSlug,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { makeSeoMetadata } from "@/lib/make-metadata";
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

async function getCategoryProducts(
  categorySlug: string,
  filter: ReturnType<typeof buildProductListFilter>,
  page: number,
  perPage: number,
) {
  "use cache";
  // 2-week stale / 5m revalidate — products change more frequently than category structure.
  cacheLife({ stale: 60 * 60 * 24 * 14, revalidate: 5 * 60, expire: 60 * 60 * 24 * 14 });
  // headkit:collections is sent by WordPress on product save/delete, covering all collection caches.
  // headkit:collection:${categorySlug}:products allows targeted per-category invalidation.
  cacheTag(
    `headkit:collection:${categorySlug}:products`,
    "headkit:collections",
  );
  return sdk.collections.list(filter, page, perPage);
}

async function CollectionProductsServer({
  categorySlug,
  productFilter,
  searchParams,
  filterSlug,
  categoryBasePath,
  perPage,
}: {
  categorySlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  filterSlug: string | undefined;
  categoryBasePath: string;
  perPage: number;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;

  // Path-decoded attributes take precedence over legacy search params.
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

  const productsResult = await getCategoryProducts(
    categorySlug,
    buildProductListFilter(
      {
        categories: sp.categories?.split(",").filter(Boolean) ?? [],
        brands: sp.brands?.split(",").filter(Boolean) ?? [],
        attributes,
        instock: sp.instock === "true",
        sort: (sp.sort ?? "") as SortKeyType | "",
        page,
      },
      { categorySlug },
    ),
    page,
    perPage,
  );

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={perPage}
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
      description: category.description,
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

  let category, productFilter;
  try {
    const data = await getCategoryData(categorySlug);
    if (!data.category) return notFound();
    category = data.category;
    productFilter = data.productFilter;
  } catch {
    return notFound();
  }

  // Legacy redirect: ?pa_color=red,blue → /collections/hoodies/f/color.blue.red (308)
  // Must run outside try/catch since permanentRedirect throws internally.
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
  const perPage = 24;

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
        {...(category.children?.length
          ? { children: category.children }
          : {})}
      />
      <Suspense fallback={<CollectionProductsSkeleton />}>
        <CollectionProductsServer
          categorySlug={categorySlug}
          productFilter={productFilter}
          searchParams={searchParams}
          filterSlug={filterSlug}
          categoryBasePath={categoryBasePath}
          perPage={perPage}
        />
      </Suspense>
    </>
  );
}
