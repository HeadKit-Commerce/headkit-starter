import type { Metadata } from "next";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import {
  buildProductListFilter,
  buildBreadcrumbFromCategory,
  collectionPathFromCategory,
  encodeFilterSlug,
  decodeFilterSlug,
  isIndexableFacet,
  isColorAttrSlug,
  facetTitle,
  facetDescription,
  formatOptionName,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { toAttributeKey } from "@/lib/color-attr-slug";
import { brandSlugsPerCategory } from "@/lib/brand-facets";
import {
  makeSeoMetadata,
  seoFallbackDescription,
  resolveRobots,
  resolveStoreName,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { resolveSiteUrl } from "@/lib/site-url";
import { TAG } from "@/lib/cache-tags";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import type { SortKeyType } from "@/components/headkit-ui/collection/utils";
import type { ProductFilters } from "@headkit/sdk";
import {
  filterCategoriesByNonEmptySlugs,
  getNonEmptyCollectionSlugs,
} from "@/lib/hide-empty-collections";
import {
  CollectionPageSkeleton,
  CollectionProductsSkeleton,
} from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import { CATALOG_PAGE_SIZE } from "@/components/headkit-ui/catalog-grid";
import { getCachedCatalogPage } from "@/lib/catalog-cache";
import { walkCategoryPaths } from "@/app/shop/shop-slug";

/** Satisfies Cache Components: `generateStaticParams` must not return []. Never a real category slug. */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

const PER_PAGE = CATALOG_PAGE_SIZE;

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
 * links) can resolve header/breadcrumb/children before click.
 *
 * `Page` awaits it once to decide the canonical redirect, which does cost this
 * route its App Shell (see the note there). Being `'use cache'` is what keeps
 * that affordable: `CollectionRoute` awaits the same entry, so the shell and
 * the body share one read, and prerendered params resolve it at build.
 * `searchParams` is the read that must still never be awaited in the shell —
 * it opts the whole segment dynamic (see `CollectionProductsServer`).
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

async function CollectionProductsServer({
  categorySlug,
  productFilter,
  searchParams,
  filterSlug,
  categoryBasePath,
  preferHeaderLcp = false,
}: {
  categorySlug: string;
  productFilter: ProductFilters;
  searchParams: Promise<Record<string, string>>;
  filterSlug: string | undefined;
  categoryBasePath: string;
  preferHeaderLcp?: boolean;
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

  const { branding } = await getBranding();

  // Shared remote catalog cache (`getCachedCatalogPage`) so load-more and the
  // initial grid share one entry, and product webhooks (`headkit:products`)
  // actually drop this PLP — the old local cache only listened to
  // `headkit:catalog:cat:{slug}`, which Shopify product payloads cannot target.
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
    {
      categorySlug,
      defaultSort: branding.defaultCollectionSort as SortKeyType,
    },
  );

  const productsResult = await getCachedCatalogPage(filter, page, PER_PAGE, {
    kind: "category",
    slug: categorySlug,
  });

  return (
    <CollectionPage
      initialProducts={productsResult.products}
      initialTotal={productsResult.total}
      productFilter={productFilter}
      initialPage={page}
      itemsPerPage={PER_PAGE}
      categorySlug={categorySlug}
      categoryBasePath={categoryBasePath}
      preferHeaderLcp={preferHeaderLcp}
      {...(initialFilterValues ? { initialFilterValues } : {})}
      {...(initialBrands ? { initialBrands } : {})}
    />
  );
}

/**
 * Encode a single-color filter slug (`color.<c>`) consistently with the URL
 * router via encodeFilterSlug. `attrSlug` is the store's own colour attribute
 * slug from getFilters (prefix stripped, e.g. `colour`) — never hard-code
 * `pa_color`, a British-spelled (or otherwise non-`pa_color`) store's colour
 * attribute would silently match zero products. Returns "" for an empty color.
 */
function colorFilterSlug(attrSlug: string, color: string): string {
  if (!color) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    attributes: { [toAttributeKey(attrSlug)]: [color] },
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
    // The SHARED walk (`app/shop/shop-slug.ts`) — the same one `resolveShopPath`
    // and `app/sitemap.ts` use. A local copy lived here and had already drifted:
    // it did not skip WooCommerce's default category, so it prerendered
    // `/collections/uncategorised` while the shared walk excluded it. A second
    // implementation that can drift is precisely how the sitemap came to
    // advertise nested while everything else named flat.
    //
    // `includeExcluded: true` preserves that param set EXACTLY rather than
    // silently dropping a prerendered route as part of a de-duplication:
    // enumerating params to prerender is the one caller that wants the default
    // category kept, which is what the flag is for.
    const nodes = walkCategoryPaths(categories, { includeExcluded: true });
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
        const slug = colorFilterSlug(colorAttr?.slug ?? "", option?.slug ?? "");
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        paths.push({ slug: [...node.segments, "f", slug] });
      }
    }

    // Tier-1 category×brand params (06.1): one single-brand entry per category
    // per brand — but ONLY for pairs that actually contain a product. The
    // per-category brand list rides along on the same `getFilters` call the
    // colour facets above already made, so this costs no extra build-time read
    // while removing the empty pairs of the old blind cross-product (9,499 of
    // 10,000 on one measured store). `lib/brand-facets.ts` owns the rule and
    // `app/sitemap.ts` calls the same helper, so the two cannot drift.
    //
    // Prerendering only: an un-emitted pair still routes and still 200s on
    // demand, it just pays a cold render on first hit.
    try {
      // perPage capped at 100 — headkit/v2/brands 400s above 100 (REST max arg).
      const brandsRes = await sdk.brands.list({ perPage: 100 });
      const globalBrandSlugs = brandsRes.brands.map((b) => b?.slug ?? "");
      const perCategoryBrands = brandSlugsPerCategory(
        filterResults.map(({ filters }) => filters),
        globalBrandSlugs,
      );
      for (const [i, { node }] of filterResults.entries()) {
        const seenBrand = new Set<string>();
        for (const brandSlug of perCategoryBrands[i] ?? []) {
          const slug = brandFilterSlug(brandSlug);
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
  const { categorySlug, filterSlug } = parseCollectionSlug(slug);
  if (!categorySlug) return {};
  try {
    const [{ category, productFilter }, { seoSettings, storeSettings }] =
      await Promise.all([getCategoryData(categorySlug), getBranding()]);
    if (!category) return {};
    const siteName = resolveStoreName(storeSettings.name);
    // Derived from the CATEGORY, never from the requested path: the route
    // resolves a category from the last slug segment, so `/collections/child`
    // and `/collections/parent/child` serve identical content. Canonicalising
    // each to itself would declare both duplicates originals; this consolidates
    // both onto the nested path `app/sitemap.ts` advertises.
    //
    // KNOWN DIVERGENCE — do NOT "fix" this by reverting to the requested path.
    // The two paths come from different ancestry sources and can disagree:
    //   - here: `category.ancestors`, the TRUE parent chain, walked term by term
    //     by the WP single-category endpoint with no filtering or paging;
    //   - `app/sitemap.ts`: `walkCategoryPaths` over the tree commerce assembles
    //     in `buildCategoryForest` from the FLAT list endpoint, which is called
    //     with no query params so WordPress applies `per_page=100` and
    //     `hide_empty=true`. A child whose parent falls outside that page (or is
    //     hidden) is PROMOTED TO A ROOT, so the sitemap emits the flat path.
    // On a store with more than ~100 categories the canonical is therefore the
    // correct URL while the sitemap entry is the defective one. The canonical
    // target still serves, so this splits signal rather than breaking a URL, and
    // the real fix belongs at the origin — commerce requesting the full list
    // (`per_page` / `hide_empty=false`) so orphans stop being promoted.
    const canonicalBasePath = collectionPathFromCategory(category);

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
        // Absolute, from the runtime store domain — the same origin rule the
        // base-category branch below uses. A relative canonical would resolve
        // against the inherited `metadataBase`, which is built from the
        // build-time env and so names the stale host on a custom domain.
        const selfCanonical = storefrontUrl(
          `${canonicalBasePath}/f/${filterSlug}`,
          storeSettings.domain,
        );
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
          // Was `{ index: isProduction, follow: isProduction }` — it consulted
          // VERCEL_ENV but never the store's own switch, so a facet URL stayed
          // indexable on a store with indexing turned off. resolveRobots now
          // gates on the HOST instead of VERCEL_ENV AND honours the setting; a
          // rehearsal host noindexes whatever the switch says. The origin is the same
          // runtime store domain the self-canonical above is built from, so a
          // facet URL is judged against the store's own host like every other
          // surface — robots.txt allows /collections/*, and this must not
          // contradict it.
          robots: await resolveRobots(
            seoSettings.allowIndexing,
            resolveSiteUrl(storeSettings.domain),
          ),
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

    const metadata = await makeSeoMetadata(category.seo, {
      title: category.name,
      // Templated per-entity floor when both Yoast SEO and the category's own
      // description are absent (FE-09 / D-04). Real category.seo still wins.
      description:
        category.description ||
        seoFallbackDescription("category", category.name, storeSettings.name),
      ...(storeSettings.name != null ? { storeName: storeSettings.name } : {}),
      // Base collection pages shipped NO canonical, a straight regression from
      // the V1 storefronts.
      canonical: storefrontUrl(canonicalBasePath, storeSettings.domain),
      siteUrl: storeSettings.domain,
      allowIndexing: seoSettings.allowIndexing,
    });
    // Tier-2: any other filtered URL points back to the unfiltered collection
    // as canonical (R1: base). Unfiltered category metadata is unchanged.
    if (filterSlug) {
      metadata.alternates = {
        canonical: storefrontUrl(canonicalBasePath, storeSettings.domain),
      };
    }
    return metadata;
  } catch (error) {
    unstable_rethrow(error);
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
/**
 * Flat collection URLs: 308 onto the category's nested path, or serve.
 *
 * The route resolves a category from the LAST slug segment, so
 * `/collections/child` and `/collections/parent/child` both serve it. The
 * 2026-08-22 decision makes the nested path canonical, and this is where the
 * loser is retired.
 *
 * ### The redirect must be thrown above EVERY Suspense boundary
 *
 * Under Cache Components a redirect thrown inside a Suspense boundary runs
 * after the response has committed, so the route answers 200 with a skeleton
 * and redirects only on the client — invisible to the crawler this exists for.
 * (The `/posts` → `/news` move hit exactly that; see the note on `redirects()`
 * in `next.config.ts`.) Hence the decision is awaited here rather than in
 * `CollectionRoute`, and hence this route has **no `loading.tsx`**: a
 * route-level `loading.tsx` wraps the page component in an IMPLICIT boundary,
 * which puts even the default export inside one — as does a boundary in an
 * ANCESTOR layout, which is why `app/layout.tsx` no longer wraps `{children}`
 * in a `<Suspense>`. Measured on a Next 16.3 build with `cacheComponents: true`,
 * one variable at a time — see the fuller table in
 * `app/products/[...slug]/page.tsx`:
 *
 *   with a `loading.tsx` present        → 200 + skeleton (client-side redirect)
 *   with a root-layout `<Suspense>`     → 200 + skeleton (client-side redirect)
 *   with neither                        → 308, prerendered AND at runtime
 *
 * Nothing is lost by the file's absence: the `<Suspense>` below renders the
 * identical `<CollectionPageSkeleton />` that `loading.tsx` did. Re-introducing
 * either boundary silently turns every flat collection URL back into a 200
 * duplicate; `e2e/canonical-url-308.spec.ts` fails on the status code when one
 * does.
 *
 * The remaining cost is this route's App Shell — awaiting in the default export
 * forfeits Partial Prefetching here. The awaited read is `getCategoryData`,
 * which `CollectionRoute` awaits anyway and which is `'use cache'`, so it is
 * the same cache entry rather than an extra round trip, and every param in
 * `generateStaticParams` still prerenders (verified: `◐ Partial Prerender`, not
 * dynamic).
 *
 * ### The same mechanism governs `notFound()`, and it is gated here too
 *
 * A missing category answered 200 with a streamed not-found body for exactly
 * this reason, so the existence check is resolved here as well. The conditions
 * that let it set the status — and why `instant` is NOT one of them — live once
 * in "Setting a status code needs THREE conditions" in `apps/starter/AGENTS.md`;
 * `instant = false` below is that section's declaration rule. Both
 * `app/not-found-status.test.ts` and `e2e/not-found-status.spec.ts` guard it.
 *
 * ### The 308 carries the path, not the query
 *
 * `searchParams` is deliberately NOT awaited: doing so would opt the whole
 * segment dynamic and seal the skeleton as the shell for every request (see
 * `CollectionProductsServer`). So path-encoded facets (`/f/…`) survive the
 * redirect because they are slug segments, while a query string on a flat URL
 * is dropped. Three cases, named explicitly because they are not equally cheap:
 *
 *   - `?page=2` / `?sort=` — the shopper lands on page 1 in the default order.
 *   - `?q=` / `?price_min=` / `?instock=` — the same, unfiltered.
 *   - `?pa_color=red`, `?brands=…` — a LEGACY FACET, and the case that carries
 *     V1 link equity. `CollectionProductsServer` folds those into the `/f/…`
 *     path form with a second 308, but that fold is now unreachable from a flat
 *     URL because this redirect fires before `CollectionProductsServer` ever
 *     runs, so the shopper lands on the unfiltered nested collection.
 *
 * Accepted rather than fixed: folding the facet into this redirect target needs
 * `searchParams` here, which opts the whole segment dynamic — the exact cost the
 * paragraph above refuses. The flat shape has no internal links left after this
 * change, so the traffic is external links and crawlers, and the destination is
 * the collection they asked for.
 */
export const instant = false;

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  // The build-time placeholder is never served from a prerender, so a runtime
  // request for it is a junk URL and must 404 HERE. Skipping the gate for it
  // instead let it fall through to `CollectionRoute`, whose `notFound()` fires
  // below the boundary — the soft 404 this gate exists to close.
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) notFound();

  const redirectTo = await canonicalCollectionRedirect(slug);
  if (redirectTo) permanentRedirect(redirectTo);

  // Pre-commit 404 gate. Only the EXISTENCE decision is hoisted; the product
  // grid (and its `searchParams` read) stays inside the boundary below and
  // still streams. `CollectionRoute` repeats the checks — it is also entered
  // from `/shop/[...slug]` — and the `"use cache"` category read dedupes, so
  // the repeat is a cache hit.
  const { categorySlug } = parseCollectionSlug(slug);
  if (!categorySlug) notFound();
  // A THROWN read is transport/infra and must not bake a sticky 404 into the
  // route cache — `getCategoryData` deliberately does not catch, so it
  // propagates from here exactly as it does from `CollectionRoute`. Only the
  // null (genuinely missing) case reaches `notFound()`.
  const { category } = await getCategoryData(categorySlug);
  if (!category) notFound();

  return (
    <Suspense fallback={<CollectionPageSkeleton />}>
      <CollectionRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The path this collection URL must 308 to, or null when it is already
 * canonical.
 *
 * Null — never a redirect — for the build-time placeholder, an unresolvable
 * slug, and a category the API cannot supply, so an outage can never turn into
 * a redirect. Null also when the canonical equals the requested path, which is
 * what makes a root category (no ancestors, canonical `/collections/{slug}`)
 * serve rather than redirect to itself.
 */
async function canonicalCollectionRedirect(
  slug: string[],
): Promise<string | null> {
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return null;
  const { categorySlug, filterSlug, categoryBasePath } =
    parseCollectionSlug(slug);
  if (!categorySlug) return null;

  const { category } = await getCategoryData(categorySlug);
  if (!category) return null;

  const canonicalBasePath = collectionPathFromCategory(category);
  if (canonicalBasePath === categoryBasePath) return null;
  return filterSlug
    ? `${canonicalBasePath}/f/${filterSlug}`
    : canonicalBasePath;
}

/**
 * Exported so the nested `/shop/[...slug]` route renders the IDENTICAL
 * collection view for a category URL rather than duplicating it (D-15-04).
 *
 * The shop route passes the category's own segments, so `categoryBasePath`
 * stays `/collections/…`: facet links and the legacy query-facet redirect below
 * therefore target the `/collections` namespace, which serves them. Pointing
 * them at `/shop/…` would emit a permanent redirect into a path the shop
 * catch-all classifies as unknown — RESEARCH C-6 in a new shape.
 */
export async function CollectionRoute({ params, searchParams }: Props) {
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
  // The one path this category is canonical at — also the base its child
  // category tiles link beneath, so they name nested paths instead of the flat
  // shape this route now redirects.
  const canonicalBasePath = collectionPathFromCategory(category);
  const { branding } = await getBranding();
  const nonEmptySlugs = branding.hideEmptyCollections
    ? await getNonEmptyCollectionSlugs()
    : null;
  const childCategories =
    nonEmptySlugs && category.children?.length
      ? filterCategoriesByNonEmptySlugs(category.children, nonEmptySlugs)
      : (category.children ?? []);
  const hasChildren = childCategories.length > 0;
  // Header owns LCP when: (1) leaf featured thumbnail, or (2) parent subcategory
  // carousel (first card is priority). Keep product grid cards lazy in both cases.
  const preferHeaderLcp =
    hasChildren || (!hasChildren && Boolean(category.thumbnail));

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
        childBasePath={canonicalBasePath}
        {...(category.thumbnail ? { thumbnail: category.thumbnail } : {})}
        {...(childCategories.length > 0 ? { children: childCategories } : {})}
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
          preferHeaderLcp={preferHeaderLcp}
        />
      </Suspense>
    </>
  );
}
