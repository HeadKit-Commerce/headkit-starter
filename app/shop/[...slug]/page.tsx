import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { headkit as sdk } from "@/lib/sdk";
import { getCachedProduct } from "@/lib/product-cache";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";
import { TAG } from "@/lib/cache-tags";
import { ProductPageContent } from "@/app/products/[...slug]/page";
import { ProductPageShell } from "@/app/products/[...slug]/product-page-shell";
import { CollectionRoute } from "@/app/collections/[...slug]/page";
import {
  resolveShopPath,
  shopSegmentsFromPath,
  uriToRelativePath,
  type ShopCategoryNode,
} from "../shop-slug";

// Cache Components requires generateStaticParams to return ≥1 param. When the
// catalog API is unreachable at build we emit this single placeholder (which
// generateMetadata/the page resolve to noindex/notFound) instead of throwing —
// a transient backend error must not fail the whole tenant deploy. Mirrors the
// pattern in app/products/[...slug]/page.tsx.
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

const NOINDEX: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | undefined;
};

/**
 * Nested shop route — D-15-04, replacing the permanent redirect to
 * `/products/{slug}`.
 *
 * WordPress mints WooCommerce product permalinks as `/shop/{cat}[/{sub}]/{slug}`
 * and those are the URLs live stores have indexed. The replaced implementation
 * answered every such URL with a 308 to a flat path. Two problems:
 *
 *  1. A 308 is cached by clients indefinitely, so it is the one act in a
 *     migration that a rollback cannot undo — after a flip back, those clients
 *     keep requesting a path the old stack never served.
 *  2. It took `slug[slug.length - 1]` unconditionally and so could not tell a
 *     product slug from a category slug, redirecting category URLs into a
 *     product route that answered not-found (RESEARCH C-6) — live for every
 *     store on this template, not just the migrating one.
 *
 * This route therefore serves real pages: `resolveShopPath` decides
 * category-vs-product from the category tree, and rendering is delegated to the
 * existing flat-PDP and collection views so the compositions cannot drift.
 * No permanent redirect is issued from this namespace.
 *
 * The flat `/products/{slug}` route is untouched and keeps serving its own URLs;
 * this adds a second valid shape rather than removing one.
 */

/**
 * Category tree for path classification.
 *
 * Deliberately NOT wrapped in a catch: the SDK returns null/empty for genuinely
 * absent data, so a THROWN error is transport/infra. Swallowing it would leave
 * an empty tree, which classifies every nested PDP as unknown and bakes a
 * sticky 404 into the route cache. Let it propagate — Next then serves the last
 * good render and retries. Same rationale as app/collections/[...slug]/page.tsx.
 */
async function getShopCategoryTree(): Promise<ProductCategoryDetail[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.collections);
  return sdk.collections.getCategories();
}

/** Category detail for the category branch's metadata. Reuses the collection tags. */
async function getShopCategory(
  slug: string,
): Promise<ProductCategoryDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.collection(slug), TAG.collections);
  return sdk.collections.getCategory(slug);
}

/**
 * Prerender the nested URL each product actually has, taken from the product's
 * own permalink — never a synthesised guess.
 *
 * Products whose permalink is not beneath `/shop` are skipped: this app has no
 * route that serves them, so prerendering them would manufacture 404s on every
 * store that uses a different WooCommerce permalink base. Those stores keep
 * exactly today's behaviour (placeholder only) and their flat PDPs are
 * unaffected.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const params: { slug: string[] }[] = [];

  try {
    let page = 1;
    let hasMore = true;

    // Paginate to completion, matching the flat PDP, so both routes prerender
    // the same catalogue rather than silently truncating at page 1.
    while (hasMore) {
      const result = await sdk.products.list({}, page, 100);
      for (const product of result.products) {
        const path = uriToRelativePath(product.uri);
        if (!path) continue;
        const segments = shopSegmentsFromPath(path);
        if (segments.length === 0) continue;
        params.push({ slug: segments });
      }
      hasMore = page < result.totalPages;
      page++;
    }
  } catch {
    /* Catalog API unreachable at build — fall through to the placeholder. */
  }

  if (params.length > 0) return params;
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return NOINDEX;

  const path = `/shop/${slug.join("/")}`;

  try {
    const categories = await getShopCategoryTree();
    const resolved = resolveShopPath(slug, categories);

    if (resolved.kind === "product") {
      const [product, { seoSettings, storeSettings }, { iconUrl }] =
        await Promise.all([
          getCachedProduct(resolved.productSlug),
          getBranding(),
          getBrandingAssets(),
        ]);
      if (!product) return NOINDEX;

      const desc = product.shortDescription || product.description;
      return await makeSeoMetadata(product.seo ?? null, {
        title: product.name,
        // Self-referential to the NESTED path: this URL shape is the one the
        // store has indexed, so it must be the canonical, not /products/…
        canonical: storefrontUrl(path, storeSettings.domain),
        ...(desc ? { description: desc } : {}),
        storeName: storeSettings.name ?? undefined,
        dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
        brandingIconUrl: iconUrl ?? undefined,
        allowIndexing: seoSettings.allowIndexing,
        siteUrl: storeSettings.domain,
      });
    }

    if (resolved.kind === "category") {
      const [category, { seoSettings, storeSettings }] = await Promise.all([
        getShopCategory(resolved.categorySlug),
        getBranding(),
      ]);
      if (!category) return NOINDEX;

      return await makeSeoMetadata(category.seo ?? null, {
        title: category.name,
        canonical: storefrontUrl(path, storeSettings.domain),
        ...(category.description ? { description: category.description } : {}),
        storeName: storeSettings.name ?? undefined,
        dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
        allowIndexing: seoSettings.allowIndexing,
        siteUrl: storeSettings.domain,
      });
    }

    // index / unknown: not a URL this route represents.
    return NOINDEX;
  } catch (error) {
    unstable_rethrow(error);
    return NOINDEX;
  }
}

/**
 * Instant Navigation (Next.js 16.3): keep the route segment sync so Partial
 * Prefetching can ship an App Shell immediately. Awaiting `params` in the
 * default export blocks the shell. Stream via Suspense.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page(props: Props): ReactNode {
  return (
    <Suspense fallback={<ProductPageShell />}>
      <ShopRouteContent {...props} />
    </Suspense>
  );
}

async function ShopRouteContent({
  params,
  searchParams,
}: Props): Promise<ReactNode> {
  const { slug } = await params;

  // Build-time placeholder param (see generateStaticParams) is never served.
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) notFound();

  const categories: ShopCategoryNode[] = await getShopCategoryTree();
  const resolved = resolveShopPath(slug, categories);

  if (resolved.kind === "product") {
    // Delegate to the flat PDP's own content component: identical composition,
    // and its colourway links point at /products/{slug}/{color}, which IS
    // served — the shop catch-all deliberately does not classify a two-segment
    // remainder, so it must not advertise colourway URLs beneath itself.
    return (
      <ProductPageContent
        params={Promise.resolve({ slug: [resolved.productSlug] })}
        {...(searchParams !== undefined ? { searchParams } : {})}
      />
    );
  }

  if (resolved.kind === "category") {
    // Delegate to the collection view with the category's own segments, so its
    // facet links stay in the served /collections namespace (see the export
    // comment there). The canonical above still points at this /shop URL.
    return (
      <CollectionRoute
        params={Promise.resolve({ slug: resolved.segments })}
        searchParams={searchParams ?? Promise.resolve({})}
      />
    );
  }

  // index / unknown — an explicit failure to decide is a not-found, never a
  // guessed product lookup and never a permanent redirect.
  notFound();
}
