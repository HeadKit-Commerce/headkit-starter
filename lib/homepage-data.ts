import { cacheLife, cacheTag } from "next/cache";
import type { Product } from "@headkit/sdk";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import {
  HOMEPAGE_PENDING_HERO_CACHE_LIFE,
  homepageHeroMediaPending,
} from "@/lib/homepage-hero-media";

const EMPTY_COLLECTION = {
  products: [] as Product[],
  total: 0,
  page: 1,
  perPage: 8,
  totalPages: 0,
};

const HOME_TAGS: readonly string[] = [
  TAG.route("home"),
  TAG.branding,
  TAG.collections,
];

/**
 * Cached homepage payload shared by the home route and shop-wide OG
 * fallback. Keep the tags and life identical so a hero edit purges both.
 */
export async function getHomepageData() {
  "use cache";
  cacheLife("days");
  cacheTag(...HOME_TAGS);

  // Split fetches so a homepage.get() failure does not null On Sale
  // collections (P2 resilience).
  const [homepageResult, onSaleResult] = await Promise.allSettled([
    headkit.homepage.get(),
    headkit.collections.list({ onSale: true }, 1, 8),
  ]);

  const homepage =
    homepageResult.status === "fulfilled" ? homepageResult.value : null;

  // Shopify file_reference URLs resolve asynchronously and there is no
  // files/update webhook. A copy-only hero fetched during that window
  // must not pin under `days` or the blank media box stays until the
  // next catalog edit or deploy.
  if (homepageHeroMediaPending(homepage)) {
    cacheLife(HOMEPAGE_PENDING_HERO_CACHE_LIFE);
  }

  return {
    homepage,
    onSaleProducts:
      onSaleResult.status === "fulfilled"
        ? onSaleResult.value
        : EMPTY_COLLECTION,
  };
}
