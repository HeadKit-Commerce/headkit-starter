import { firstHomepageShareImage } from "@/lib/make-metadata";
import { getHomepageData } from "@/lib/homepage-data";

/**
 * Shop-wide raster for OG / Twitter — Woo Yoast `og_frontpage_image`
 * analogue. Shopify page SEO often has no image field; commerce may
 * fill `shop.brand.coverImage` onto `page.seo`. When that slot is
 * empty, the homepage hero is the same layer (before the HeadKit
 * dashboard upload and the branding icon).
 */
export async function getSiteShareImageUrl(): Promise<string | undefined> {
  const { homepage } = await getHomepageData();
  return firstHomepageShareImage(homepage?.carousels);
}
