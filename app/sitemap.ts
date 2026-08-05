import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit } from "@/lib/sdk";
import { getBranding } from "@/lib/branding";
import {
  encodeFilterSlug,
  isColorAttrSlug,
  DEFAULT_FILTER_VALUES,
} from "@/components/headkit-ui/collection/utils";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

type SitemapItem = MetadataRoute.Sitemap[number];

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

async function makeProductSitemap(): Promise<SitemapItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:products");
  try {
    const items: SitemapItem[] = [];
    let page = 1;
    let hasMore = true;

    // Paginate products.list to completion so every product's attributes/colors
    // are present (collections.list omitted them) and there is no 500-row cap.
    while (hasMore) {
      const result = await headkit.products.list({}, page, 100);
      for (const product of result.products) {
        // Base product URL.
        items.push({
          url: `${SITE_URL}/products/${product.slug}`,
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
          items.push({
            url: `${SITE_URL}/products/${product.slug}/${colorSlug}`,
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

async function makeCollectionSitemap(): Promise<SitemapItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:collections", "headkit:products", "headkit:brands");
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
        url: `${SITE_URL}/collections/${path}`,
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
          url: `${SITE_URL}/collections/${path}/f/${slug}`,
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
          url: `${SITE_URL}/collections/${path}/f/${slug}`,
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

async function makeBrandSitemap(): Promise<SitemapItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:brands");
  try {
    const result = await headkit.brands.list({ perPage: 200 });
    return result.brands.map((b) => ({
      url: `${SITE_URL}/brand/${b.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

async function makePostSitemap(): Promise<SitemapItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:posts");
  try {
    const result = await headkit.posts.list({ perPage: 200 });
    return result.posts.map((p) => ({
      url: `${SITE_URL}/news/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

async function makeProjectSitemap(): Promise<SitemapItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:projects");
  try {
    const result = await headkit.projects.list({ perPage: 200 });
    return result.projects.map((p) => ({
      url: `${SITE_URL}/projects/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Sitemap off = remove completely (no entries). robots.ts omits the Sitemap line.
  const { seoSettings } = await getBranding();
  if (!seoSettings.enableSitemap) {
    return [];
  }

  const [
    productSitemap,
    collectionSitemap,
    brandSitemap,
    postSitemap,
    projectSitemap,
  ] = await Promise.all([
    makeProductSitemap(),
    makeCollectionSitemap(),
    makeBrandSitemap(),
    makePostSitemap(),
    makeProjectSitemap(),
  ]);

  const staticPages: SitemapItem[] = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/shop`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/brand`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/projects`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/sale`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/new`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/featured`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: new Date(),
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
