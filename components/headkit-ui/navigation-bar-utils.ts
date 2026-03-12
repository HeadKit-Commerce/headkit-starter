export interface RawMenuItem {
  id: string;
  parentId: string | null;
  label: string;
  uri: string;
  description: string | null | undefined;
  cssClasses: string | null | string[] | undefined;
  order: number | null | undefined;
}

export interface RawMenuPayload {
  label: string;
  uri: string;
  description: string | null | undefined;
  cssClasses: string | null | string[] | undefined;
  order: number | null | undefined;
}

export interface MenuNode<T = RawMenuPayload> {
  id: string;
  parentId: string | null;
  payload: T;
  columns?: MenuNode<T>[][];
}

/** Removes a trailing slash from a URL, preserving the root "/" path. */
export function removeTrailingSlash(url: string): string {
  return url.length > 1 ? url.replace(/\/$/, "") : url;
}

function getOrder<T>(node: MenuNode<T>): number {
  return (node.payload as RawMenuPayload).order ?? 0;
}

function sortByOrder<T>(nodes: MenuNode<T>[]): MenuNode<T>[] {
  return [...nodes].sort((a, b) => getOrder(a) - getOrder(b));
}

export function isHiddenItem<T>(item: { payload: T }): boolean {
  if (!item.payload || typeof item.payload !== "object") return false;
  const p = item.payload as { cssClasses?: unknown };
  const raw = p.cssClasses;
  if (!raw) return false;
  if (Array.isArray(raw)) {
    return (raw as (string | null)[])
      .filter((c): c is string => c !== null)
      .includes("hidden");
  }
  if (typeof raw === "string") return raw.split(" ").includes("hidden");
  return false;
}

function createNormalizedColumns<T>(children: MenuNode<T>[]): MenuNode<T>[][] {
  if (!children.length) return [];

  const hiddenHeaders = children.filter(isHiddenItem);
  const regular = children.filter((c) => !isHiddenItem(c));

  if (hiddenHeaders.length === 0) {
    return sortByOrder(regular).map((c) => [c]);
  }

  type ColItem = {
    item: MenuNode<T>;
    type: "regular" | "hidden";
    order: number;
  };

  const colItems: ColItem[] = [
    ...regular.map((item) => ({
      item,
      type: "regular" as const,
      order: getOrder(item),
    })),
    ...hiddenHeaders.map((item) => ({
      item,
      type: "hidden" as const,
      order: getOrder(item),
    })),
  ].sort((a, b) => a.order - b.order);

  const columns: MenuNode<T>[][] = [];
  for (const { item, type } of colItems) {
    if (type === "regular") {
      columns.push([item]);
    } else if (item.columns?.length) {
      const flat = item.columns.flatMap((col) => col);
      if (flat.length) columns.push(sortByOrder(flat));
    }
  }
  return columns;
}

export function formatNodeTree<T>(opts: {
  nodes: MenuNode<T>[];
  parent: string | null;
}): MenuNode<T>[] {
  const children = sortByOrder(
    opts.nodes.filter((n) => n.parentId === opts.parent),
  );
  return children.map((node) => {
    const childNodes = formatNodeTree({ nodes: opts.nodes, parent: node.id });
    const cols = isHiddenItem(node)
      ? childNodes.length > 0
        ? [childNodes]
        : []
      : createNormalizedColumns(childNodes);
    // Avoid setting columns: undefined with exactOptionalPropertyTypes
    const result: MenuNode<T> = {
      id: node.id,
      parentId: node.parentId,
      payload: node.payload,
    };
    if (cols.length > 0) result.columns = cols;
    return result;
  });
}
