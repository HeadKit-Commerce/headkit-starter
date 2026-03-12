import type { MetadataRoute } from "next";
import { headkit } from "@/lib/sdk";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

type SitemapItem = MetadataRoute.Sitemap[number];

async function makeProductSitemap(): Promise<SitemapItem[]> {
  try {
    const result = await headkit.collections.list({}, 1, 500);
    return result.products.map((p) => ({
      url: `${SITE_URL}/shop/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    }));
  } catch {
    return [];
  }
}

async function makeCollectionSitemap(): Promise<SitemapItem[]> {
  try {
    const categories = await headkit.collections.getCategories();
    return categories
      .filter((c) => c.slug !== "uncategorised" && c.slug !== "uncategorized")
      .map((c) => ({
        url: `${SITE_URL}/collections/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch {
    return [];
  }
}

async function makeBrandSitemap(): Promise<SitemapItem[]> {
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productSitemap, collectionSitemap, brandSitemap, postSitemap] =
    await Promise.all([
      makeProductSitemap(),
      makeCollectionSitemap(),
      makeBrandSitemap(),
      makePostSitemap(),
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
  ];
}
