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
import { shopSegmentsFromPath, uriToRelativePath } from "./shop/shop-slug";
import { getPostsBasePath, postsIndexPath } from "@/lib/posts-base-path";
import { convertToRelativePath, isAppNavigationHref } from "@/lib/convert-uri";

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
 * Normalise a raw product permalink into a site-relative path, or null.
 *
 * This exists because the Go product mapper assigns the ABSOLUTE WooCommerce
 * permalink to `Product.uri`, a field the schema and the Go domain type both
 * document as relative. Correcting that upstream is explicitly deferred
 * (15.1-CONTEXT `<deferred>`), so the consumer normalises at this boundary.
 *
 * The permalink's origin is DISCARDED rather than compared with the site url.
 * In a headless store WordPress runs on a different host from the storefront by
 * design (`commerce.example.com` vs `www.example.com`), so an origin-equality
 * test would reject every product in every store and publish an empty product
 * sitemap. Because only the path survives and callers re-root it under
 * the site origin, an off-site entry (T-15.1-07-02) is impossible by construction —
 * a stronger guarantee than the comparison would have given. Protocol-relative
 * and non-http(s) input is rejected outright, since those are path-like but
 * resolve off-site.
 */
export function toSitemapPath(
  rawPermalink: string | null | undefined,
): string | null {
  return uriToRelativePath(rawPermalink);
}

/**
 * The path this storefront actually SERVES for a product.
 *
 * Prefers the product's own nested permalink path when it is beneath `/shop`,
 * which `app/shop/[...slug]` now serves (D-15-04). Anything else — a store on
 * WooCommerce's default `/product/` permalink base, an unusable permalink —
 * falls back to the flat `/products/{slug}` route, which always serves. The
 * sitemap must only ever advertise URLs that resolve.
 */
function servedProductPath(product: {
  slug: string;
  uri?: string | null;
}): string {
  const path = toSitemapPath(product.uri);
  if (path) {
    const segments = shopSegmentsFromPath(path);
    if (segments.length > 0) return `/shop/${segments.join("/")}`;
  }
  return `/products/${product.slug}`;
}

/**
 * Walk the category tree (any depth) yielding every category with its full
 * path segments — so Tier-1 color URLs are emitted for nested categories too.
 */
function walkCategoryPaths(
  categories: { slug: string; children?: { slug: string }[] }[],
  parentSegments: string[] = [],
): { slug: string; segments: string[] }[] {
  const out: { slug: string; segments: string[] }[] = [];
  for (const cat of categories) {
    if (!cat?.slug) continue;
    if (cat.slug === "uncategorised" || cat.slug === "uncategorized") continue;
    const segments = [...parentSegments, cat.slug];
    out.push({ slug: cat.slug, segments });
    if (cat.children?.length) {
      out.push(...walkCategoryPaths(cat.children, segments));
    }
  }
  return out;
}

/** Encode a single-color filter slug (`color.<c>`) consistent with the router. */
function colorFilterSlug(color: string): string {
  if (!color) return "";
  return encodeFilterSlug({
    ...DEFAULT_FILTER_VALUES,
    attributes: { pa_color: [color] },
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
        // Base product URL — the product's own permalink path (D-15-04), so
        // the sitemap advertises the shape the store has indexed and this app
        // serves, rather than a synthesised flat guess.
        items.push({
          url: `${siteUrl}${servedProductPath(product)}`,
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
          // Colourways stay beneath the FLAT product path. `app/shop/[...slug]`
          // deliberately does not classify a trailing colour segment (a
          // two-segment remainder is `unknown`), so nesting these under the
          // shop path would advertise URLs that answer not-found.
          items.push({
            url: `${siteUrl}/products/${product.slug}/${colorSlug}`,
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

    for (const { node, filters } of filterResults) {
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
        const slug = colorFilterSlug(option?.slug ?? "");
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        items.push({
          url: `${siteUrl}/collections/${path}/f/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
      // Tier-1 category×brand single-facet URLs (06.1). Brands are global, so the
      // same brand set is emitted under each category — single value, no combos.
      const seenBrand = new Set<string>();
      for (const brand of brandsRes.brands) {
        const slug = brandFilterSlug(brand?.slug ?? "");
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

/**
 * The storefront routes the sitemap always emits itself, in emitted order.
 *
 * Kept as ONE list because two places need it: the static section below, and
 * {@link makePageSitemap}, which must not spend an existence probe on a path
 * that is already covered here only for the final dedupe to drop the duplicate.
 * `/contact` and `/faq` are CMS pages AND hardcoded routes, and they are
 * exactly the links a footer menu carries, so the waste was the common case.
 */
function staticSitemapRoutes(postsIndex: string): readonly {
  path: string;
  changeFrequency: NonNullable<SitemapItem["changeFrequency"]>;
  priority: number;
}[] {
  return [
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
 * `convertToRelativePath` strips the origin of ANY http(s) menu uri — it cannot
 * tell a WordPress permalink from a social link — so an external link arrives
 * here as a bare path. The existence probe is what makes that safe: only a path
 * this store actually publishes is emitted, and it is emitted under `siteUrl`,
 * so an off-site `<loc>` stays impossible by construction.
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
