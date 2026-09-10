/**
 * Mega-menu column containers.
 *
 * WordPress has no first-class notion of a mega-menu column, so themes express
 * one as an ordinary Custom Link that carries no destination (its URI collapses
 * to `/`) and is marked with the CSS class `hidden`. Its children are the real
 * links; its own label ("Column 1", "Column 2", …) is layout scaffolding and
 * must never reach a shopper.
 *
 * The v1 storefront implemented exactly this in
 * `src/lib/headkit/utils/format-node-tree.ts` (`isHiddenItem` /
 * `createNormalizedColumns`), and the SAME WordPress menu still feeds a live v1
 * site on several migrating stores — so the containers cannot be deleted in
 * WordPress without breaking that site. The renderer has to understand them.
 *
 * Two rules, and they are the whole contract:
 *
 * 1. **A container is a column.** Inside a mega-menu panel, a container's
 *    children collapse into ONE column; every non-container sibling becomes a
 *    column of its own. A container that ends up with no children yields no
 *    column at all (this is what made "Column 4" and "Column 5" render as empty
 *    grid cells on Bike Society once hide-empty had dropped their only child).
 * 2. **Everywhere else a container is invisible.** In any flat context — the
 *    mobile sheet, a column's own sub-lists — a container is spliced away and
 *    replaced by its children, at every depth.
 *
 * `hidden` is a deliberate merchant convention, not a label heuristic: keying on
 * the word "Column" would miss a renamed container, and keying on "URI is `/`"
 * would swallow a legitimate "shop all" parent that links home.
 */

/** CSS class a WordPress menu item carries to mark it a mega-menu column container. */
export const MEGA_MENU_COLUMN_CLASS = "hidden";

/** Minimal menu-node shape the column helpers need: classes plus own-typed children. */
export type ColumnNodeLike = {
  cssClasses?: string[] | null | undefined;
  children: ColumnNodeLike[];
};

/**
 * True when a menu item is a mega-menu column container rather than a link.
 *
 * WordPress may deliver classes as separate array entries or space-joined
 * inside one entry, so both are inspected.
 */
export function isMegaMenuColumnContainer(item: {
  cssClasses?: string[] | null | undefined;
}): boolean {
  for (const raw of item.cssClasses ?? []) {
    if (typeof raw !== "string") continue;
    if (raw.split(/\s+/).includes(MEGA_MENU_COLUMN_CLASS)) return true;
  }
  return false;
}

/**
 * Replaces every container in `items` with its own children, recursively, so a
 * flat list never carries a container label. Order is preserved: a container's
 * children take its position among its siblings.
 */
export function flattenColumnContainers<
  T extends { cssClasses?: string[] | null | undefined; children: T[] },
>(items: readonly T[]): T[] {
  return items.flatMap((item) =>
    isMegaMenuColumnContainer(item)
      ? flattenColumnContainers(item.children)
      : [item],
  );
}

/**
 * Flattens containers at EVERY depth of a menu subtree, so no container label
 * can render anywhere. Used for the mobile sheet and for the entries inside a
 * desktop column.
 */
export function normalizeMenuTree<
  T extends { cssClasses?: string[] | null | undefined; children: T[] },
>(items: readonly T[]): T[] {
  return flattenColumnContainers(items).map(
    (item): T => ({ ...item, children: normalizeMenuTree(item.children) }),
  );
}

/**
 * Splits the children of a mega-menu parent into rendered columns.
 *
 * A container contributes ONE column holding its (recursively flattened)
 * children; every other child contributes a column of its own. Columns that
 * would be empty are dropped, so a container whose children were all filtered
 * away — by hide-empty, say — leaves no empty grid cell behind.
 *
 * Entries are returned fully normalized, so a container nested deeper inside a
 * column is spliced away too.
 */
export function toMegaMenuColumns<
  T extends { cssClasses?: string[] | null | undefined; children: T[] },
>(children: readonly T[]): T[][] {
  const columns: T[][] = [];
  for (const child of children) {
    const column = isMegaMenuColumnContainer(child)
      ? normalizeMenuTree(child.children)
      : normalizeMenuTree([child]);
    if (column.length > 0) columns.push(column);
  }
  return columns;
}
