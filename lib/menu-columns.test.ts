import { describe, expect, it, vi } from "vitest";

// One assertion below crosses into hide-empty, whose module pulls the SDK
// client and next/cache at import time. Same stubs as
// hide-empty-collections.test.ts — the helper under test is pure.
vi.mock("@/lib/sdk", () => ({
  headkit: {
    collections: {
      getCategories: (): Promise<unknown[]> => Promise.resolve([]),
      getCategory: (): Promise<null> => Promise.resolve(null),
    },
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: (): void => undefined,
  cacheLife: (): void => undefined,
}));
import {
  flattenColumnContainers,
  isMegaMenuColumnContainer,
  normalizeMenuTree,
  toMegaMenuColumns,
} from "@/lib/menu-columns";
import {
  CLOTHING_AND_GEAR,
  EQUIPMENT,
  BIKES,
  column,
  link,
  type NavFixtureItem,
} from "@/lib/__fixtures__/bikesociety-nav";
import {
  collectionSlugFromUri,
  filterMenuItemsByNonEmptyCollections,
} from "@/lib/hide-empty-collections";

/** Every node under `items`, at any depth, including `items` themselves. */
function allNodes(items: readonly NavFixtureItem[]): NavFixtureItem[] {
  return items.flatMap((item) => [item, ...allNodes(item.children)]);
}

/** Every label rendered anywhere under `items`, at any depth. */
function labelsDeep(items: readonly NavFixtureItem[]): string[] {
  return allNodes(items).map((item) => item.label);
}

describe("isMegaMenuColumnContainer", () => {
  it("matches the `hidden` class as its own array entry", () => {
    expect(isMegaMenuColumnContainer({ cssClasses: ["hidden"] })).toBe(true);
  });

  it("matches `hidden` inside a space-joined class string", () => {
    expect(
      isMegaMenuColumnContainer({ cssClasses: ["menu-item hidden wide"] }),
    ).toBe(true);
  });

  it("does not match a class that merely contains the word", () => {
    expect(isMegaMenuColumnContainer({ cssClasses: ["hidden-xs"] })).toBe(
      false,
    );
    expect(isMegaMenuColumnContainer({ cssClasses: [] })).toBe(false);
    expect(isMegaMenuColumnContainer({})).toBe(false);
    expect(isMegaMenuColumnContainer({ cssClasses: null })).toBe(false);
  });
});

describe("toMegaMenuColumns", () => {
  it("gives each container's children ONE column and never its label", () => {
    const columns = toMegaMenuColumns(EQUIPMENT.children);

    // Six containers in, six columns out.
    expect(columns).toHaveLength(6);
    expect(columns[0]?.map((i) => i.label)).toEqual([
      "Bags & Storage",
      "Computers",
    ]);
    expect(columns[1]?.map((i) => i.label)).toEqual(["Components"]);
    expect(columns[4]?.map((i) => i.label)).toEqual(["Saddles", "Tubes"]);

    const rendered = labelsDeep(columns.flat());
    expect(rendered.some((label) => /^Column \d+$/.test(label))).toBe(false);
  });

  it("keeps the fourth level under each column heading", () => {
    const columns = toMegaMenuColumns(EQUIPMENT.children);
    const bags = columns[0]?.[0];

    expect(bags?.label).toBe("Bags & Storage");
    expect(bags?.children.map((c) => c.label)).toEqual([
      "Backpacks",
      "Bike Packing",
      "Frame",
      "Pannier",
      "Seat",
      "Storage Bottles",
      "Travel Bags",
    ]);
  });

  it("gives every non-container sibling a column of its own", () => {
    // BIKES has no containers at all: five children, five columns, unchanged.
    const columns = toMegaMenuColumns(BIKES.children);

    expect(columns).toHaveLength(5);
    expect(columns.map((col) => col.map((i) => i.label))).toEqual([
      ["Electric Bikes"],
      ["Fitness & Urban Bikes"],
      ["Kids Bikes"],
      ["Mountain Bikes"],
      ["Road Bikes"],
    ]);
  });

  it("keeps mixed container / non-container siblings in menu order", () => {
    const mixed = [
      link("Sale"),
      column("Column 1", [link("Helmets"), link("Gloves")]),
      link("New In"),
    ];

    expect(
      toMegaMenuColumns(mixed).map((col) => col.map((i) => i.label)),
    ).toEqual([["Sale"], ["Helmets", "Gloves"], ["New In"]]);
  });

  it("flattens a container nested inside a container into the same column", () => {
    const nested = [
      column("Column 1", [
        link("Helmets"),
        column("Column 1a", [link("Gloves"), link("Eyewear")]),
      ]),
    ];

    const columns = toMegaMenuColumns(nested);
    expect(columns).toHaveLength(1);
    expect(columns[0]?.map((i) => i.label)).toEqual([
      "Helmets",
      "Gloves",
      "Eyewear",
    ]);
  });

  it("flattens a container that sits at the THIRD level, under a heading", () => {
    const deep = [
      column("Column 1", [
        link("Helmets", [
          column("Column 1a", [link("Road"), link("Mountain")]),
          link("Kids & Youth"),
        ]),
      ]),
    ];

    const helmets = toMegaMenuColumns(deep)[0]?.[0];
    expect(helmets?.children.map((c) => c.label)).toEqual([
      "Road",
      "Mountain",
      "Kids & Youth",
    ]);
  });

  it("emits no column for a container whose children were all filtered away", () => {
    // Bike Society's CLOTHING & GEAR: `Nutrition & Care` (Column 4) and `Shoes`
    // (Column 5) are the two collections the categories-pagination defect hid,
    // so hide-empty drops them and their containers are left empty.
    const slugsOf = (nodes: readonly NavFixtureItem[]): string[] =>
      allNodes(nodes)
        .map((node) => collectionSlugFromUri(node.uri))
        .filter((slug): slug is string => slug !== null);

    // Every slug in the panel, minus the two subtrees the pagination defect
    // hid. Slugs, not labels: hide-empty only ever sees a slug, and a leaf slug
    // shared with another branch ("mountain", "road") is empty for both.
    const emptySubtrees = allNodes(CLOTHING_AND_GEAR.children).filter((node) =>
      ["Nutrition & Care", "Shoes"].includes(node.label),
    );
    const empty = new Set(slugsOf(emptySubtrees));
    const nonEmpty = new Set(
      slugsOf(CLOTHING_AND_GEAR.children).filter((slug) => !empty.has(slug)),
    );

    const filtered = filterMenuItemsByNonEmptyCollections(
      [CLOTHING_AND_GEAR],
      nonEmpty,
    );
    const columns = toMegaMenuColumns(filtered[0]?.children ?? []);

    // Six containers in the menu, four columns rendered — and not one empty.
    expect(columns).toHaveLength(4);
    expect(columns.every((col) => col.length > 0)).toBe(true);
    expect(columns.map((col) => col[0]?.label)).toEqual([
      "Apparel",
      "Eyewear",
      "Helmets",
      "Bike Society Custom Apparel",
    ]);
  });

  it("drops an empty container even when it is the only child", () => {
    expect(toMegaMenuColumns([column("Column 1", [])])).toEqual([]);
  });
});

describe("normalizeMenuTree (flat surfaces — the mobile sheet)", () => {
  it("splices containers away at every depth and keeps the real links", () => {
    const flattened = normalizeMenuTree(EQUIPMENT.children);

    expect(flattened.map((i) => i.label).slice(0, 3)).toEqual([
      "Bags & Storage",
      "Computers",
      "Components",
    ]);
    expect(
      labelsDeep(flattened).some((label) => /^Column \d+$/.test(label)),
    ).toBe(false);
    // Nothing is lost: the fourth level survives the splice.
    expect(labelsDeep(flattened)).toContain("Travel Bags");
  });

  it("leaves a container-free tree byte-for-byte equivalent", () => {
    expect(normalizeMenuTree(BIKES.children)).toEqual(BIKES.children);
  });
});

describe("flattenColumnContainers", () => {
  it("keeps sibling order when a container expands in place", () => {
    const items = [
      link("A"),
      column("Column", [link("B"), link("C")]),
      link("D"),
    ];
    expect(flattenColumnContainers(items).map((i) => i.label)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });
});
