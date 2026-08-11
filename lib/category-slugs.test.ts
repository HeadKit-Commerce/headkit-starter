import { describe, expect, it } from "vitest";
import {
  collectCategorySlugsDeep,
  collectDirectChildSlugs,
} from "./category-slugs";

/**
 * The e2e store's real shape: three roots that each carry two subcategories.
 * Before MIG-03 `productCategories` returned all nine FLAT; now it returns the
 * three roots with the rest nested.
 */
const forest = [
  {
    slug: "men",
    children: [
      { slug: "mens-shirts", children: [{ slug: "mens-tshirts" }] },
      { slug: "mens-outerwear" },
    ],
  },
  { slug: "women", children: [{ slug: "dresses" }, { slug: "womens-shirts" }] },
  { slug: "accessories" },
];

describe("collectCategorySlugsDeep", () => {
  // The regression guard. A top-level-only read returns 3 here, and every
  // subcategory then reads as "empty" to hide-empty-collections — which drops
  // them from the menus and leaves their parent as a plain link with no
  // dropdown at all.
  it("descends into children so subcategories are not mistaken for empty", () => {
    const slugs = collectCategorySlugsDeep(forest);

    expect(slugs.size, "a top-level-only read would return 3").toBe(8);
    for (const slug of [
      "men",
      "mens-shirts",
      "mens-tshirts",
      "mens-outerwear",
      "women",
      "dresses",
      "womens-shirts",
      "accessories",
    ]) {
      expect(slugs.has(slug), `${slug} missing from the non-empty set`).toBe(
        true,
      );
    }
  });

  // Callers match against slugs parsed out of URLs and WP `hk-collection:`
  // classes, which are not guaranteed to be normalised.
  it("normalises case and surrounding whitespace", () => {
    expect(
      collectCategorySlugsDeep([{ slug: "  Mens-Shirts " }]).has("mens-shirts"),
    ).toBe(true);
  });

  it("skips blank slugs rather than adding an empty entry", () => {
    const slugs = collectCategorySlugsDeep([
      { slug: "" },
      { slug: "   " },
      { slug: null },
      { slug: "men" },
    ]);
    expect([...slugs]).toEqual(["men"]);
  });

  it("returns an empty set for null, undefined and []", () => {
    expect(collectCategorySlugsDeep(null).size).toBe(0);
    expect(collectCategorySlugsDeep(undefined).size).toBe(0);
    expect(collectCategorySlugsDeep([]).size).toBe(0);
  });

  // A cycle should never reach here, but this graph has produced one before —
  // a hang in a cached server render is a far worse failure than a missing slug.
  it("terminates on a cyclic tree", () => {
    const a: { slug: string; children: unknown[] } = {
      slug: "a",
      children: [],
    };
    const b = { slug: "b", children: [a] };
    a.children = [b];

    const slugs = collectCategorySlugsDeep([a] as never);
    expect([...slugs].sort()).toEqual(["a", "b"]);
  });
});

/**
 * GetProductCategories only selects one `children` level. Mid-level nodes
 * (Outdoor Furniture) appear as children of roots, but their own children
 * (Outdoor Dining Chairs, …) are absent from that response. Hide-empty must
 * know which mid-level slugs to expand via getCategory so leaf/handpicked
 * categories are not treated as empty.
 */
describe("collectDirectChildSlugs", () => {
  it("returns only the first nested level (candidates for getCategory expand)", () => {
    // Shape of the GraphQL response today: roots + one children level.
    // Grandchildren are NOT present — that is the bug we expand around.
    const graphqlShapedForest = [
      {
        slug: "outdoor-furniture",
        children: [
          { slug: "outdoor-dining-chairs" },
          { slug: "outdoor-lounges-armchairs" },
        ],
      },
      {
        slug: "indoor-furniture",
        children: [{ slug: "indoor-dining-chairs" }],
      },
      { slug: "accessories" },
    ];

    expect(collectDirectChildSlugs(graphqlShapedForest).sort()).toEqual([
      "indoor-dining-chairs",
      "outdoor-dining-chairs",
      "outdoor-lounges-armchairs",
    ]);
  });

  it("normalises case/whitespace and dedupes", () => {
    expect(
      collectDirectChildSlugs([
        {
          slug: "root",
          children: [
            { slug: "  Mid-Level " },
            { slug: "mid-level" },
            { slug: "" },
            { slug: null },
          ],
        },
      ]),
    ).toEqual(["mid-level"]);
  });

  it("returns [] for null, undefined, [], and roots with no children", () => {
    expect(collectDirectChildSlugs(null)).toEqual([]);
    expect(collectDirectChildSlugs(undefined)).toEqual([]);
    expect(collectDirectChildSlugs([])).toEqual([]);
    expect(collectDirectChildSlugs([{ slug: "root" }])).toEqual([]);
  });
});
