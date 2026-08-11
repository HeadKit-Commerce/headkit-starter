/**
 * Category-tree slug collection.
 *
 * Deliberately dependency-free — no SDK, no `next/cache`, no env. The module
 * that consumes this (`hide-empty-collections.ts`) imports `@/lib/sdk`, whose
 * top-level `createClientSDK()` throws without a validated env, so anything
 * defined there cannot be unit-tested. The rule this encodes is worth testing.
 */

/** Minimal shape of a category node — only what slug collection needs. */
export type CategoryNodeLike = {
  slug?: string | null;
  children?: readonly CategoryNodeLike[] | null;
};

/**
 * Collects every slug in a category FOREST, descending into `children`.
 *
 * The depth is the point. `commerce.productCategories` used to answer with a
 * FLAT list — every category, at the top level — so reading `.map(n => n.slug)`
 * saw all of them. MIG-03 made it return a real tree: roots at the top level,
 * subcategories nested underneath. A top-level-only read therefore silently
 * stopped seeing subcategories, and every consumer that treats "absent from
 * this set" as "empty" began classifying every subcategory as empty.
 *
 * The visible symptom was menus: a parent whose children were all subcategories
 * lost all of them, so it rendered as a plain link instead of a dropdown
 * trigger, and its whole mega-menu disappeared from the site.
 *
 * Slugs are trimmed and lowercased because callers match case-insensitively
 * against slugs parsed out of URLs and WP CSS classes.
 */
export function collectCategorySlugsDeep(
  nodes: readonly CategoryNodeLike[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!nodes) return out;

  // Iterative: a malformed tree must not blow the stack in a server render.
  // `seen` guards a cycle, which the mapper is not supposed to emit but which
  // has been possible in this exact graph before (the two directions of a
  // category tree point at each other).
  const seen = new Set<CategoryNodeLike>();
  const stack: CategoryNodeLike[] = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);

    const slug = node.slug?.trim().toLowerCase();
    if (slug) out.add(slug);

    if (node.children) stack.push(...node.children);
  }

  return out;
}

/**
 * Collects slugs of direct children across a forest (one level down from roots).
 *
 * Used by hide-empty to decide which mid-level categories to re-fetch via
 * `getCategory`. `GetProductCategories` only selects one `children` level, so
 * grandchildren/leaves are invisible to a deep walk of that response alone —
 * which dropped handpicked homepage categories and mega-menu leaf links.
 */
export function collectDirectChildSlugs(
  nodes: readonly CategoryNodeLike[] | null | undefined,
): string[] {
  if (!nodes) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    for (const child of node.children ?? []) {
      const slug = child.slug?.trim().toLowerCase();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }

  return out;
}
