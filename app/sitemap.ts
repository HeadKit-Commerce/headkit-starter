import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit } from "@/lib/sdk";
import { getBranding } from "@/lib/branding";
import { resolveSiteUrl } from "@/lib/site-url";
import { TAG } from "@/lib/cache-tags";
import {
  encodeFilterSlug,
  isColorAttrSlug,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";
import { shopSegmentsFromPath, uriToRelativePath } from "./shop/shop-slug";

type SitemapItem = MetadataRoute.Sitemap[number];

/**
 * Tags that must invalidate the assembled sitemap. Content webhooks already
 * fire these via `/api/revalidate`; listing them on the single cached entry
 * means the XML stays warm until catalogue/CMS/branding actually changes.
 */
const SITEMAP_TAGS = [
  TAG.products,
  TAG.collections,
  TAG.brands,
  TAG.posts,
  TAG.projects,
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

async function makePostSitemap(siteUrl: string): Promise<SitemapItem[]> {
  try {
    const result = await headkit.posts.list({ perPage: 200 });
    return result.posts.map((p) => ({
      url: `${siteUrl}/news/${p.slug}`,
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

  const [
    productSitemap,
    collectionSitemap,
    brandSitemap,
    postSitemap,
    projectSitemap,
  ] = await Promise.all([
    makeProductSitemap(siteUrl),
    makeCollectionSitemap(siteUrl),
    makeBrandSitemap(siteUrl),
    makePostSitemap(siteUrl),
    makeProjectSitemap(siteUrl),
  ]);

  // lastModified is stamped when the cache entry is filled — not per request —
  // so crawlers see a stable document until the next tag invalidation.
  const builtAt = new Date();

  const staticPages: SitemapItem[] = [
    {
      url: siteUrl,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/shop`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/brand`,
      lastModified: builtAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/news`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/projects`,
      lastModified: builtAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: builtAt,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: builtAt,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/sale`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/new`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/featured`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/search`,
      lastModified: builtAt,
      changeFrequency: "daily",
      priority: 0.5,
    },
  ];

  return [
    ...staticPages,
    ...productSitemap,
    ...collectionSitemap,
    ...brandSitemap,
    ...postSitemap,
    ...projectSitemap,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildCachedSitemap();
}
