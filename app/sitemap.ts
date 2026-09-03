import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit } from "@/lib/sdk";
import { getBranding } from "@/lib/branding";
import { resolveSiteUrl } from "@/lib/site-url";
import { KNOWN_MENU_LOCATIONS, TAG } from "@/lib/cache-tags";
import {
  encodeFilterSlug,
  isColorAttrSlug,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { toAttributeKey } from "@/lib/color-attr-slug";
import { brandSlugsPerCategory } from "@/lib/brand-facets";
import { walkCategoryPaths } from "./shop/shop-slug";
import { productPath } from "@/lib/canonical-path";
import { getPostsBasePath, postsIndexPath } from "@/lib/posts-base-path";
import { convertToRelativePath, isAppNavigationHref } from "@/lib/convert-uri";
import { storeSitemapRoutes } from "@/sitemap.config";
import type { StoreSitemapRoute } from "@/sitemap.config";

type SitemapItem = MetadataRoute.Sitemap[number];

/**
 * Tags that must invalidate the assembled sitemap. Content webhooks already
 * fire these via `/api/revalidate`; listing them on the single cached entry
 * means the XML stays warm until catalogue/CMS/branding actually changes.
 *
 * `TAG.pages` is listed because the entry is subscribed to it whether or not it
 * appears here: `buildCachedSitemap` awaits `getPostsBasePath()`, itself a
 * `"use cache"` fn tagged `TAG.posts` + `TAG.pages`, and Next 16.3 propagates a
 * nested entry's tags AND cache life outward to the enclosing entry
 * (`propagateCacheLifeAndTagsToRevalidateStore`). Naming it makes the real
 * coupling visible instead of leaving it to be rediscovered — `bridgeOne` maps
 * the legacy `headkit:carousel` tag onto `TAG.pages` (`lib/cache-tags.ts`), so
 * a carousel/slide edit already rebuilds this whole fan-out.
 *
 * That same propagation takes the MIN of stale/revalidate/expire, so the
 * nested `cacheLife("hours")` already overrides the `cacheLife("days")` below:
 * the effective backstop is revalidate 1h / expire 24h, not days. A newly
 * published or newly menu-linked page therefore lands within the hour at
 * worst, which is why `TAG.menu(...)` is deliberately NOT subscribed — menus
 * are the page section's discovery source, but an hourly floor already bounds
 * the staleness and each extra tag widens the purge blast radius.
 */
const SITEMAP_TAGS = [
  TAG.products,
  TAG.collections,
  TAG.brands,
  TAG.posts,
  TAG.projects,
  TAG.pages,
  TAG.branding,
] as const;

/**
 * Encode a single-color filter slug (`color.<c>`) consistent with the router.
 * `attrSlug` is the store's own colour attribute slug from getFilters (prefix
 * stripped, e.g. `colour`) — must match `app/collections/[...slug]/page.tsx`'s
 * colorFilterSlug exactly, or the sitemap advertises URLs the collection route
 * does not serve.
 */
function colorFilterSlug(attrSlug: string, color: string): string {
  if (!color) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    attributes: { [toAttributeKey(attrSlug)]: [color] },
  });
}

/** Encode a single-brand filter slug (`brand.<b>`) consistent with the router (06.1). */
function brandFilterSlug(brand: string): string {
  if (!brand) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    brands: [brand],
  });
}

async function makeProductSitemap(siteUrl: string): Promise<SitemapItem[]> {
  try {
    const items: SitemapItem[] = [];
    let page = 1;
    let hasMore = true;

    // Paginate products.list to completion so every product's attributes/colors
    // are present (collections.list omitted them) and there is no 500-row cap.
    while (hasMore) {
      const result = await headkit.products.list({}, page, 100);
      for (const product of result.products) {
        // Base product URL — `productPath` is the ONE derivation of a
        // product's canonical path, shared with the canonical tag, the 308
        // target and the JSON-LD `url`. A second copy here is exactly how the
        // sitemap came to advertise the nested shape while every other signal
        // named the flat one.
        items.push({
          url: `${siteUrl}${productPath(product)}`,
          lastModified: new Date(),
          changeFrequency: "daily",
          priority: 1,
        });

        // Variable products: one colorway URL per color option (Tier-1 only —
        // never size or other attributes).
        const colorAttr = product.attributes.find((a) =>
          isColorAttrSlug(a.slug),
        );
        const seen = new Set<string>();
        for (const option of colorAttr?.fullOptions ?? []) {
          const colorSlug = option?.slug ?? "";
          if (!colorSlug || seen.has(colorSlug)) continue;
          seen.add(colorSlug);
          // Colourways follow the base onto whichever shape won:
          // `app/shop/[...slug]` now classifies a trailing colour segment, so a
          // nested product's colourways are nested too and the sitemap never
          // advertises a URL that redirects.
          items.push({
            url: `${siteUrl}${productPath(product, colorSlug)}`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.8,
          });
        }
      }
      hasMore = page < result.totalPages;
      page++;
    }

    return items;
  } catch {
    return [];
  }
}

async function makeCollectionSitemap(siteUrl: string): Promise<SitemapItem[]> {
  try {
    const [categories, brandsRes] = await Promise.all([
      headkit.collections.getCategories(),
      // perPage capped at 100 — the headkit/v2/brands WP endpoint 400s above 100.
      headkit.brands.list({ perPage: 100 }).catch(() => ({ brands: [] })),
    ]);
    const nodes = walkCategoryPaths(categories);
    const items: SitemapItem[] = [];

    // Per category: base PLP + one Tier-1 URL per present color + one Tier-1 URL
    // per brand (single-facet only). No deeper combos (no size/price/multi-value,
    // no color+brand combos).
    const filterResults = await Promise.all(
      nodes.map((node) =>
        headkit.collections
          .getFilters(node.slug)
          .then((f) => ({ node, filters: f }))
          .catch(() => ({ node, filters: null })),
      ),
    );

    // Per-category brand slugs, resolved from the SAME `getFilters` results the
    // colour facets use — no extra read. `lib/brand-facets.ts` is shared with
    // `app/collections/[...slug]/page.tsx`'s generateStaticParams so the sitemap
    // cannot advertise a pair the build declined to prerender, or vice versa.
    const globalBrandSlugs = brandsRes.brands.map((b) => b?.slug ?? "");
    const perCategoryBrands = brandSlugsPerCategory(
      filterResults.map(({ filters }) => filters),
      globalBrandSlugs,
    );

    for (const [i, { node, filters }] of filterResults.entries()) {
      const path = node.segments.join("/");
      items.push({
        url: `${siteUrl}/collections/${path}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      });
      const colorAttr = filters?.attributes?.find((a) =>
        isColorAttrSlug(a?.slug ?? ""),
      );
      const seen = new Set<string>();
      for (const option of colorAttr?.options ?? []) {
        // colorFilterSlug yields exactly `color.<c>` for a single color, so the
        // emitted URL is `/collections/<path>/f/color.<c>` (Tier-1 only).
        const slug = colorFilterSlug(colorAttr?.slug ?? "", option?.slug ?? "");
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        items.push({
          url: `${siteUrl}/collections/${path}/f/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
      // Tier-1 category×brand single-facet URLs (06.1) — only for pairs that
      // contain a product. Single value, no combos.
      const seenBrand = new Set<string>();
      for (const brandSlug of perCategoryBrands[i] ?? []) {
        const slug = brandFilterSlug(brandSlug);
        if (!slug || seenBrand.has(slug)) continue;
        seenBrand.add(slug);
        items.push({
          url: `${siteUrl}/collections/${path}/f/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Storefront route trees that are NOT WordPress pages. A menu link beneath one
 * of these is a product / collection / brand / post / app route and is either
 * emitted by its own sitemap section or deliberately excluded (`/search` is
 * disallowed in robots.txt; cart, checkout and account are private).
 */
const NON_PAGE_PREFIXES = [
  "/shop",
  "/collections",
  "/products",
  "/brand",
  "/projects",
  "/client",
  "/news",
  "/search",
  "/cart",
  "/checkout",
  "/account",
  "/auth",
  "/api",
] as const;

/**
 * Upper bound on CMS existence probes.
 *
 * Each probe is a FULL `content(type: PAGE)` payload (body, hydrated
 * `editorBlocks`, related posts) fetched only to learn whether the page
 * exists — the schema has no cheaper existence query — and the SDK gates reads
 * behind a 4-slot semaphore shared with the product/collection/brand/post/
 * project fan-out. So every probe both costs a page render and delays the
 * other sections of the same uncached cold build, which `buildCachedSitemap`
 * exists to keep off the crawler's request path.
 *
 * Menus carry tens of links, most of them catalogue routes filtered out before
 * probing, so this is a bound on a pathological menu rather than a working
 * limit. Keep it low for that reason.
 */
const MAX_PAGE_CANDIDATES = 40;

type StaticSitemapRoute = {
  path: string;
  changeFrequency: NonNullable<SitemapItem["changeFrequency"]>;
  priority: number;
};

/** The `<changefreq>` values the sitemap protocol defines. */
const SITEMAP_CHANGE_FREQUENCIES: readonly StaticSitemapRoute["changeFrequency"][] =
  ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];

/** Whether an arbitrary config value is a sitemap-valid `<changefreq>`. */
function isSitemapChangeFrequency(
  value: unknown,
): value is StaticSitemapRoute["changeFrequency"] {
  return (
    typeof value === "string" &&
    (SITEMAP_CHANGE_FREQUENCIES as readonly string[]).includes(value)
  );
}

/**
 * Vet the store-owned routes from `sitemap.config.ts` before they join the
 * platform list.
 *
 * The store owns WHICH routes it declares; this owns whether a declaration can
 * corrupt the document. Only SHAPE is checked — an entry that could produce an
 * off-site or malformed tag is dropped, so the guarantee the product and page
 * sections make (a `<loc>` is always this store's origin plus a path it chose)
 * survives an arbitrary config edit. Whether a path RESOLVES is deliberately
 * not checked at all; a well-formed path that happens to 404 is emitted, and
 * the resolve-or-do-not-advertise block in `sitemap.config.ts` says why these
 * are the one section that is never probed.
 *
 * Every field AND the container itself is vetted at runtime rather than trusted
 * to its declared type, because a config is source a store edits: a `number`
 * field can arrive as `NaN` from `Number(process.env.X)` with the var unset, a
 * union-typed field can arrive as any string through a cast or plain JS, and
 * the export itself can be a non-iterable through the same routes. A
 * non-iterable must degrade to "no store routes" rather than throw, because
 * {@link staticSitemapRoutes} is called unguarded from `buildCachedSitemap`:
 * a `TypeError` there escapes the default export and 500s `/sitemap.xml`
 * entirely — every product, collection, brand, post and page lost, not just the
 * store's own section.
 *
 * A path is rejected unless it starts with a single `/` (which excludes bare
 * slugs, absolute URLs, protocol-relative `//host/x` — path-like, but it
 * resolves off-site — and the home path, since the trailing-slash strip
 * collapses `"/"` to `""`; the platform always emits home itself, so a store
 * restating it can only be noise). It is also rejected when it carries a query,
 * a hash, whitespace or a control character (on-site but not a valid URL), or
 * one of the characters that is illegal as raw XML text. That last class is
 * load-bearing: Next 16.3 interpolates the url into `<loc>` with NO escaping
 * (`next/dist/build/webpack/loaders/metadata/resolve-route-data.js`), so this
 * validator is the only defense, and a single `&` in one store path makes every
 * crawler reject the WHOLE document, not just that entry. It is rejected rather
 * than escaped because this is a shape validator, not a transformer — silently
 * rewriting a store-authored path is a change the store cannot see. The
 * platform's own routes are literal ASCII slugs, so they are unaffected.
 *
 * An entry is rejected outright when `changeFrequency` is not one of the
 * protocol's values, and when `priority` is not a finite number: a non-finite
 * priority has no nearest in-range value to clamp toward, so it is dropped
 * rather than repaired. Trailing slashes are normalised away and a FINITE
 * `priority` is clamped to 0.0–1.0, because both are typos rather than intent.
 */
function normaliseStoreSitemapRoutes(
  routes: readonly StoreSitemapRoute[],
): StaticSitemapRoute[] {
  if (!Array.isArray(routes)) return [];
  const out: StaticSitemapRoute[] = [];
  for (const route of routes) {
    if (typeof route?.path !== "string") continue;
    const path = route.path.replace(/\/+$/, "");
    if (!path.startsWith("/") || path.startsWith("//")) continue;
    if (/[?#&<>\s\u0000-\u001f\u007f]/.test(path)) continue;
    if (!isSitemapChangeFrequency(route.changeFrequency)) continue;
    if (!Number.isFinite(route.priority)) continue;
    out.push({
      path,
      changeFrequency: route.changeFrequency,
      priority: Math.min(1, Math.max(0, route.priority)),
    });
  }
  return out;
}

/**
 * The storefront routes the sitemap always emits itself, in emitted order.
 *
 * Kept as ONE list because two places need it: the static section below, and
 * {@link makePageSitemap}, which must not spend an existence probe on a path
 * that is already covered here only for the final dedupe to drop the duplicate.
 * `/contact` and `/faq` are CMS pages AND hardcoded routes, and they are
 * exactly the links a footer menu carries, so the waste was the common case.
 *
 * The store's own landing pages (`sitemap.config.ts`) are appended HERE, to
 * that same one list, rather than at either call site. That is the whole point
 * of the extension point: feed only the emitting section and a store route that
 * is also a CMS page emits twice; feed only the probe-skip set and it never
 * appears at all. Appending once makes both consumers correct by construction,
 * and keeps a store from ever needing to edit this file.
 *
 * Platform routes win a collision — a store restating `/sale` gets the
 * platform's entry, not a second one — and duplicates within the store's own
 * list collapse to the first occurrence.
 */
function staticSitemapRoutes(
  postsIndex: string,
): readonly StaticSitemapRoute[] {
  const platform: StaticSitemapRoute[] = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/shop", changeFrequency: "daily", priority: 0.8 },
    { path: "/brand", changeFrequency: "weekly", priority: 0.7 },
    { path: postsIndex, changeFrequency: "daily", priority: 0.7 },
    { path: "/projects", changeFrequency: "weekly", priority: 0.7 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
    { path: "/sale", changeFrequency: "daily", priority: 0.7 },
    { path: "/new", changeFrequency: "daily", priority: 0.7 },
    { path: "/featured", changeFrequency: "daily", priority: 0.7 },
    { path: "/search", changeFrequency: "daily", priority: 0.5 },
  ];

  const claimed = new Set(platform.map((route) => route.path));
  const store: StaticSitemapRoute[] = [];
  for (const route of normaliseStoreSitemapRoutes(storeSitemapRoutes)) {
    if (claimed.has(route.path)) continue;
    claimed.add(route.path);
    store.push(route);
  }
  return store.length > 0 ? [...platform, ...store] : platform;
}

/** Site-relative path with query, hash and trailing slash removed, or null. */
function menuItemPath(uri: string | null | undefined): string | null {
  const relative = convertToRelativePath(uri);
  if (!isAppNavigationHref(relative)) return null;
  const path = (relative.split("#")[0] ?? "").split("?")[0] ?? "";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length > 1 ? trimmed : null;
}

/** Depth-first walk of a menu tree yielding every item's uri. */
function collectMenuUris(
  items: readonly { uri: string; children?: readonly unknown[] }[],
): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!item) continue;
    out.push(item.uri);
    const children = item.children as
      | readonly { uri: string; children?: readonly unknown[] }[]
      | undefined;
    if (children?.length) out.push(...collectMenuUris(children));
  }
  return out;
}

/**
 * WordPress content pages (`/about`, `/legal/privacy-policy`, the marketing
 * landing pages) — the one content type the sitemap had NO source for, so those
 * URLs were absent even with the sitemap switched on.
 *
 * There is no "list pages" query in the schema (`content()` resolves a single
 * node by slug), and adding one spans WordPress, commerce, the gateway and SDK
 * codegen. The navigation menus are the storefront's own record of which CMS
 * pages a store publishes, so they are the discovery source here; every
 * candidate is then CONFIRMED to exist via `content(type: PAGE)` before it is
 * emitted, keeping the file's rule that the sitemap only ever advertises URLs
 * that actually serve.
 *
 * Known limitation: a published page linked from no menu is not discovered.
 * That is a smaller gap than the current one (no pages at all) and closing it
 * needs the pages-list query above.
 *
 * Off-site absolute menu URIs (Instagram, etc.) stay absolute in
 * `convertToRelativePath` and are rejected by `menuItemPath` /
 * `isAppNavigationHref`. WordPress backend permalinks are still stripped to
 * paths and confirmed via `content(type: PAGE)` before emit, so an off-site
 * `<loc>` stays impossible by construction.
 */
async function makePageSitemap(
  siteUrl: string,
  postsBase: string,
  builtAt: Date,
): Promise<SitemapItem[]> {
  try {
    // Every location WordPress can populate — WordPress pages are only
    // reachable through navigation in a headless storefront, so this is the
    // discovery source for them. Shared with the cache-tag fan-out so a new
    // location cannot be added there and silently go undiscovered here.
    const menus = await headkit.menu.getMenus([...KNOWN_MENU_LOCATIONS]);
    const postsIndex = postsIndexPath(postsBase);
    const excludedPrefixes = [...NON_PAGE_PREFIXES, postsIndex];
    // Already emitted by the static section — probing these buys nothing.
    const staticPaths = new Set(
      staticSitemapRoutes(postsIndex)
        .map((route) => route.path)
        .filter((path) => path.length > 0),
    );

    const candidates: string[] = [];
    const seen = new Set<string>();
    for (const menu of menus) {
      for (const uri of collectMenuUris(menu?.items ?? [])) {
        const path = menuItemPath(uri);
        if (!path || seen.has(path) || staticPaths.has(path)) continue;
        if (
          excludedPrefixes.some(
            (prefix) => path === prefix || path.startsWith(`${prefix}/`),
          )
        ) {
          continue;
        }
        seen.add(path);
        candidates.push(path);
        if (candidates.length >= MAX_PAGE_CANDIDATES) break;
      }
      if (candidates.length >= MAX_PAGE_CANDIDATES) break;
    }

    const resolved = await Promise.all(
      candidates.map(async (path) => {
        // `content()` resolves a PAGE by bare slug/path (no leading slash),
        // nested paths included — same call `app/[...slug]` serves from.
        const page = await headkit.content
          .get(path.slice(1), "PAGE")
          .catch(() => null);
        return page ? path : null;
      }),
    );

    return resolved
      .filter((path): path is string => path !== null)
      .map((path) => ({
        url: `${siteUrl}${path}`,
        lastModified: builtAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
  } catch {
    return [];
  }
}

async function makeBrandSitemap(siteUrl: string): Promise<SitemapItem[]> {
  try {
    const result = await headkit.brands.list({ perPage: 200 });
    return result.brands.map((b) => ({
      url: `${siteUrl}/brand/${b.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

async function makePostSitemap(
  siteUrl: string,
  postsBase: string,
): Promise<SitemapItem[]> {
  try {
    const result = await headkit.posts.list({ perPage: 200 });
    const index = postsIndexPath(postsBase);
    return result.posts.map((p) => ({
      url: `${siteUrl}${index}/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

async function makeProjectSitemap(siteUrl: string): Promise<SitemapItem[]> {
  try {
    const result = await headkit.projects.list({ perPage: 200 });
    return result.projects.map((p) => ({
      url: `${siteUrl}/projects/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

/**
 * Assemble the full sitemap once and keep it remote-cached.
 *
 * With `cacheComponents: true`, `sitemap.ts` is a dynamic Route Handler by
 * default (Next.js 16.3). Without an outer `"use cache"`, every Googlebot /
 * GSC fetch rebuilds the catalogue fan-out (~10–20s) and Vercel never serves a
 * HIT — which surfaces as Search Console "Couldn't fetch".
 *
 * Pattern matches Cache Components guidance: one durable cached entry,
 * `cacheLife("days")` as the finite backstop, and contract tags so
 * `/api/revalidate` (`revalidateTag(t, { expire: 0 })`) refreshes only when
 * products/collections/brands/posts/projects/branding change.
 */
async function buildCachedSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(...SITEMAP_TAGS);

  // Sitemap off = remove completely (no entries). robots.ts omits the Sitemap line.
  const { seoSettings, storeSettings } = await getBranding();
  if (!seoSettings.enableSitemap) {
    return [];
  }

  // Prefer runtime store domain over baked NEXT_PUBLIC_FRONTEND_URL so a custom
  // domain attached without redeploy still produces correct <loc> origins.
  const siteUrl = resolveSiteUrl(storeSettings.domain);
  if (!siteUrl) {
    return [];
  }

  // lastModified is stamped when the cache entry is filled — not per request —
  // so crawlers see a stable document until the next tag invalidation.
  const builtAt = new Date();

  const postsBasePromise = getPostsBasePath();
  const [
    productSitemap,
    collectionSitemap,
    brandSitemap,
    postsBase,
    projectSitemap,
    postSitemap,
    pageSitemap,
  ] = await Promise.all([
    makeProductSitemap(siteUrl),
    makeCollectionSitemap(siteUrl),
    makeBrandSitemap(siteUrl),
    postsBasePromise,
    makeProjectSitemap(siteUrl),
    postsBasePromise.then((base) => makePostSitemap(siteUrl, base)),
    postsBasePromise.then((base) => makePageSitemap(siteUrl, base, builtAt)),
  ]);

  const postsIndex = postsIndexPath(postsBase);

  const staticPages: SitemapItem[] = staticSitemapRoutes(postsIndex).map(
    (route) => ({
      url: `${siteUrl}${route.path}`,
      lastModified: builtAt,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }),
  );

  const entries = [
    ...staticPages,
    ...productSitemap,
    ...collectionSitemap,
    ...brandSitemap,
    ...postSitemap,
    ...projectSitemap,
    ...pageSitemap,
  ];

  // A CMS page can also be a hardcoded storefront route (`/contact`, `/faq`),
  // so the page source can restate a static entry. Keep the first occurrence.
  const emitted = new Set<string>();
  return entries.filter((entry) => {
    if (emitted.has(entry.url)) return false;
    emitted.add(entry.url);
    return true;
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildCachedSitemap();
}
