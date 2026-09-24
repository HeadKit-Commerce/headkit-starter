import type { ReactNode } from "react";

/**
 * Extra homepage category tiles. Customer-owned — append store tiles here
 * instead of editing `app/page.tsx`.
 */
export type HomepageCategoryTile = {
  name: string;
  slug: string;
  uri: string;
  thumbnail?: unknown;
  cardLinkText?: string;
};

export function extendHomepageCategories<T extends HomepageCategoryTile>(
  categories: readonly T[],
): T[] {
  return [...categories];
}

/**
 * Rendered after the Featured products section and before On Sale.
 */
export function HomeAfterFeatured(): ReactNode {
  return null;
}
