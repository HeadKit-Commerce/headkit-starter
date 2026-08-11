import { cacheLife, cacheTag } from "next/cache";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import { collectCategorySlugsDeep } from "@/lib/category-slugs";

/**
 * URI patterns that point at a product category / collection page.
 * Captures the full path after the base so nested
 * `/collections/parent/child` resolves to the leaf slug `child`.
 */
const COLLECTION_PATH_RE =
  /(?:^|\/)(?:collections|product-category|categoria-producto)\/([^?#]+)/i;

/**
 * CSS class stamped by the WP theme on Product Category menu items
 * (`hk-collection:{term-slug}`) so we can identify collections even when the
 * custom link URL is not a `/collections/...` path.
 */
const HK_COLLECTION_CLASS_RE = /^hk-collection:(.+)$/i;

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
 * For nested paths (`/collections/parent/child`), returns the leaf slug.
 * Returns null for non-collection destinations (pages, products, external links).
 */
export function collectionSlugFromUri(
  uri: string | null | undefined,
): string | null {
  if (!uri) return null;
  const match = COLLECTION_PATH_RE.exec(uri);
  if (!match?.[1]) return null;
  const segments = match[1]
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const leaf = segments[segments.length - 1];
  if (!leaf) return null;
  try {
    return decodeURIComponent(leaf).toLowerCase();
  } catch {
    return leaf.toLowerCase();
  }
}

/**
 * Resolves the product-category slug for a menu node.
 * Prefers the WP `hk-collection:{slug}` class (taxonomy menu items), then
 * falls back to parsing the URI.
 */
export function collectionSlugFromMenuItem(
  item: Pick<MenuNodeLike, "uri" | "cssClasses">,
): string | null {
  for (const raw of item.cssClasses ?? []) {
    const cls = raw?.trim();
    if (!cls) continue;
    const match = HK_COLLECTION_CLASS_RE.exec(cls);
    const fromClass = match?.[1]?.trim();
    if (fromClass) {
      try {
        return decodeURIComponent(fromClass).toLowerCase();
      } catch {
        return fromClass.toLowerCase();
      }
    }
  }
  return collectionSlugFromUri(item.uri);
}

/**
 * Fetches the set of category slugs that currently have at least one product.
 * Relies on the commerce categories listing, which excludes empty categories by
 * default (WordPress `hide_empty=true`).
 *
 * Walks the whole FOREST, not just its roots. `productCategories` used to
 * answer flat — every category at the top level — and MIG-03 made it a real
 * tree. A top-level read therefore stopped seeing subcategories, which made
 * every one of them look empty and dropped them from the menus.
 *
 * Leaf/grandchild visibility comes from nested `children` selection on
 * `GetProductCategories` (see `packages/sdk` collections operations). Do **not**
 * expand mid-level nodes via `getCategory`: that endpoint returns children with
 * `hide_empty=false`, which would put empty leaf slugs into this set and undo
 * hide-empty filtering in menus and carousels.
 *
 * Returns `null` when the catalog listing fails so callers can fail open
 * (skip filtering) instead of treating every collection as empty.
 */
export async function getNonEmptyCollectionSlugs(): Promise<ReadonlySet<string> | null> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.collections);

  try {
    const categories = await headkit.collections.getCategories();
    return collectCategorySlugsDeep(categories);
  } catch {
    return null;
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
 * categories. Non-collection menu items are always kept. An empty collection
 * parent is kept only when it still has non-empty children (mega-menu headers).
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

      const slug = collectionSlugFromMenuItem(item);
      const isEmptyCollection =
        slug !== null && slug.length > 0 && !nonEmptySlugs.has(slug);

      if (isEmptyCollection && children.length === 0) {
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
