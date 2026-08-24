import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { headkit as sdk } from "@/lib/sdk";
import { getBranding } from "@/lib/branding";
import { makeSeoMetadata, storefrontUrl } from "@/lib/make-metadata";
import { TAG } from "@/lib/cache-tags";
import {
  generateMetadata as productMetadata,
  ProductPageContent,
} from "@/app/products/[...slug]/page";
import { ProductPageShell } from "@/app/products/[...slug]/product-page-shell";
import { CollectionRoute } from "@/app/collections/[...slug]/page";
import { collectionPathFromCategory } from "@/components/headkit-ui/collection/utils";
import { productPath, productShopSegments } from "@/lib/canonical-path";
import { getCachedProduct } from "@/lib/product-cache";
import {
  resolveShopPath,
  SHOP_PATH_PREFIX,
  type ShopCategoryNode,
  type ShopProductCandidate,
} from "../shop-slug";

// Cache Components requires generateStaticParams to return ≥1 param. When the
// catalog API is unreachable at build we emit this single placeholder (which
// generateMetadata/the page resolve to noindex/notFound) instead of throwing —
// a transient backend error must not fail the whole tenant deploy. Mirrors the
// pattern in app/products/[...slug]/page.tsx.
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

const NOINDEX: Metadata = { robots: { index: false, follow: false } };

/** The `/products/[...slug]` params a candidate reading delegates to. */
function candidateParams(candidate: ShopProductCandidate): string[] {
  return candidate.colourSlug !== undefined
    ? [candidate.productSlug, candidate.colourSlug]
    : [candidate.productSlug];
}

/**
 * Resolve the requested path to the product it really names, or null.
 *
 * `resolveShopPath` is pure and has no catalogue access by design, so it hands
 * back READINGS in priority order and the choice between them is made here,
 * where a product can actually be looked up.
 *
 * Two acceptance rules, and the difference between them is the whole point:
 *
 *  - `ancestryValidated` — every segment ahead of the slug was matched against
 *    the category tree, so existence is enough. Serving it without comparing
 *    permalinks is REQUIRED, not lax: a product filed in two categories is
 *    reachable under either chain and the decision deliberately serves both,
 *    consolidating them by canonical rather than by a redirect.
 *  - otherwise — a containment guess about a truncated tree. Existence proves
 *    nothing there, so the product's OWN permalink must reproduce the requested
 *    path exactly. That single comparison is what keeps `/shop/junk/junk/{real}`
 *    answering not-found instead of 200, and what stops `…/{slug}/{colour}`
 *    resolving to an unrelated product that happens to be slugged like a colour.
 *    The permalink is the authority precisely where the tree is not — the same
 *    determinism rule the canonical itself rests on, one level down.
 *
 * `getCachedProduct` is the shared `"use cache"` entry both PDP routes read, so
 * a probe costs a cached lookup and the accepted one is a hit again when the
 * delegated component reads it.
 *
 * Null means no reading survived: the caller answers not-found / noindex.
 */
async function resolveProductParams(
  slug: readonly string[],
  candidates: readonly ShopProductCandidate[],
): Promise<string[] | null> {
  const requestedPath = `/${SHOP_PATH_PREFIX}/${slug.join("/")}`;

  for (const candidate of candidates) {
    const product = await getCachedProduct(candidate.productSlug);
    if (!product) continue;
    if (candidate.ancestryValidated) return candidateParams(candidate);
    if (productPath(product, candidate.colourSlug) === requestedPath) {
      return candidateParams(candidate);
    }
  }
  return null;
}

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
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
 *
 * Since the 2026-08-22 canonical decision this namespace is also the WINNER for
 * products: `/products/{slug}` now 308s here, every internal link is built from
 * the same `productPath`, and colourway URLs moved here too
 * (`/shop/{cat…}/{slug}/{colour}`).
 *
 * This route still issues NO permanent redirect of its own. Two URL shapes it
 * serves are not canonical, and both consolidate by canonical tag alone:
 *
 *  - a product filed in two categories, reached under the chain that is not the
 *    one in its permalink;
 *  - a category archive, whose one canonical is its `/collections/…` path.
 *
 * Neither was named by the decision, which spent its 308s on the flat
 * `/products/{slug}` and `/collections/{child}` shapes. A 308 is the single act
 * a rollback cannot undo (point 1 above), so it is spent only where the
 * decision asked for it.
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
 *
 * PRERENDER COVERAGE — the two PDP routes do NOT match, and which of them is
 * canonical depends on the store's WooCommerce permalink base, so state both
 * classes rather than one:
 *
 *   NESTED-permalink store (`/shop/{cat…}/{slug}`) — THIS route is canonical and
 *   is UNCAPPED, paginating the catalogue to completion, as it already did
 *   before the canonical flip. The flat route (`app/products/[...slug]`) is the
 *   redirect shim there, and it is CAPPED at `HEADKIT_PRERENDER_PRODUCT_LIMIT`
 *   (default 150), so what the cap bounds is how many 308s get prerendered.
 *
 *   DEFAULT-permalink store (`/product/{slug}`) — `productShopSegments` returns
 *   null for every product, so `generateStaticParams` here emits only the
 *   placeholder and this route contributes nothing. `productPath` returns the
 *   FLAT path, making `app/products/[...slug]` the canonical route, and the same
 *   cap therefore bounds canonical PDP prerendering on that store.
 *
 * So `HEADKIT_PRERENDER_PRODUCT_LIMIT` governs whichever route is canonical for
 * the store's permalink base — EXCEPT on a nested-permalink store, where the
 * canonical route is the uncapped one. Extending the cap here was considered and
 * rejected: on a nested-permalink store with N > 150 products it would cut
 * prerendered canonical PDPs from N to 150, a real reduction in coverage of the
 * primary URL class rather than a relocation of an existing bound. A cap that
 * governs the canonical route in both classes is filed as
 * `260824-prerender-cap-nested-pdp`.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const params: { slug: string[] }[] = [];

  try {
    let page = 1;
    let hasMore = true;

    // Paginate to completion — uncapped, see the coverage note above.
    while (hasMore) {
      const result = await sdk.products.list({}, page, 100);
      for (const product of result.products) {
        // The same derivation the canonical, the 308 target and the sitemap
        // use, so this route can only prerender URLs they name.
        const segments = productShopSegments(product);
        if (!segments) continue;
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

  try {
    const categories = await getShopCategoryTree();
    const resolved = resolveShopPath(slug, categories);

    if (resolved.kind === "product") {
      const productParams = await resolveProductParams(
        slug,
        resolved.candidates,
      );
      if (!productParams) return NOINDEX;

      // Delegate to the flat PDP's own metadata, exactly as the page delegates
      // rendering. It resolves the canonical from `productPath(product, …)`,
      // which is the NESTED path — taken from the PRODUCT, never from the
      // requested URL. A product filed in two categories is reachable under
      // either chain; deriving the canonical from the request would make each
      // reachable chain declare itself an original, the same split under a new
      // name. Delegating also means a colourway URL keeps the `Name – Colour`
      // title, the variant OG image and the noindex-an-invalid-colour rule
      // rather than acquiring a thinner copy here.
      return productMetadata({
        params: Promise.resolve({ slug: productParams }),
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
        // A category archive's canonical is its `/collections/…` path, never
        // this `/shop/…` one: `app/sitemap.ts` advertises the collections
        // shape, and the collection view this route delegates to renders its
        // facet links there too. Naming this URL instead would leave a category
        // with two self-declared originals — the very split the product side of
        // this route exists to close. No redirect is issued: the captain's
        // decision names the flat `/collections/{child}` shape as the one that
        // 308s, and a 308 is the one act a rollback cannot undo, so a URL shape
        // the decision did not name is consolidated by canonical alone.
        canonical: storefrontUrl(
          collectionPathFromCategory(category),
          storeSettings.domain,
        ),
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
    const productParams = await resolveProductParams(slug, resolved.candidates);
    if (!productParams) notFound();

    // Delegate to the flat PDP's own content component: identical composition,
    // and identical links — it builds every href from `productPath(product)`,
    // so the colourway links it renders are the nested ones this catch-all now
    // classifies, not the `/products/…` shape that 308s here.
    //
    // A chain that is reachable but is NOT the product's own permalink chain
    // (a product filed under two categories) is served here rather than
    // redirected: the canonical above already names the one original, and the
    // decision that put a 308 on the flat shapes did not name this one — a 308
    // is the single act a rollback cannot undo, so it is spent only where the
    // decision asked for it.
    return (
      <ProductPageContent params={Promise.resolve({ slug: productParams })} />
    );
  }

  if (resolved.kind === "category") {
    // Delegate to the collection view with the category's own segments, so its
    // facet links stay in the served /collections namespace (see the export
    // comment there). The canonical emitted by `generateMetadata` above points
    // at that same `/collections/…` path, NOT at this `/shop` URL — a category
    // archive served here is a duplicate that consolidates by canonical tag,
    // which is why the two agree on the collections shape.
    return (
      <CollectionRoute
        params={Promise.resolve({ slug: resolved.segments })}
        searchParams={searchParams}
      />
    );
  }

  // index / unknown — an explicit failure to decide is a not-found, never a
  // guessed product lookup and never a permanent redirect.
  notFound();
}
