import { cacheLife, cacheTag } from "next/cache";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";

/** URI patterns that point at a product category / collection page. */
const COLLECTION_URI_RE =
  /(?:^|\/)(?:collections|product-category|categoria-producto)\/([^/?#]+)/i;

/** Menu-like node with optional nested children (header/footer nav). */
export type MenuNodeLike = {
  id: string;
  label: string;
  uri: string;
  description?: string | null;
  cssClasses?: string[] | null;
  children?: MenuNodeLike[];
};

/**
 * Extracts a collection slug from a menu or category URI when present.
 * Returns null for non-collection destinations (pages, products, external links).
 */
export function collectionSlugFromUri(
  uri: string | null | undefined,
): string | null {
  if (!uri) return null;
  const match = COLLECTION_URI_RE.exec(uri);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

/**
 * Fetches the set of category slugs that currently have at least one product.
 * Relies on the commerce categories listing, which excludes empty categories by
 * default (WordPress `hide_empty=true`).
 */
export async function getNonEmptyCollectionSlugs(): Promise<
  ReadonlySet<string>
> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.collections);

  try {
    const categories = await headkit.collections.getCategories();
    return new Set(
      categories
        .map((node) => node.slug?.trim().toLowerCase())
        .filter((slug): slug is string => Boolean(slug)),
    );
  } catch {
    return new Set();
  }
}

/**
 * Filters product categories to those whose slug is in the non-empty set.
 */
export function filterCategoriesByNonEmptySlugs<
  T extends Pick<ProductCategoryDetail, "slug"> | { slug?: string | null },
>(categories: readonly T[], nonEmptySlugs: ReadonlySet<string>): T[] {
  return categories.filter((category) => {
    const slug = category.slug?.trim().toLowerCase();
    if (!slug) return false;
    return nonEmptySlugs.has(slug);
  });
}

/**
 * Recursively filters menu trees, dropping collection links that target empty
 * categories. Non-collection menu items are always kept.
 */
export function filterMenuItemsByNonEmptyCollections<T extends MenuNodeLike>(
  items: readonly T[],
  nonEmptySlugs: ReadonlySet<string>,
): T[] {
  return items
    .map((item): T | null => {
      const children = Array.isArray(item.children)
        ? filterMenuItemsByNonEmptyCollections(item.children, nonEmptySlugs)
        : [];

      const slug = collectionSlugFromUri(item.uri);
      if (slug && !nonEmptySlugs.has(slug)) {
        return null;
      }

      if (!Array.isArray(item.children)) {
        return item;
      }

      return {
        ...item,
        children,
      };
    })
    .filter((item): item is T => item !== null);
}
