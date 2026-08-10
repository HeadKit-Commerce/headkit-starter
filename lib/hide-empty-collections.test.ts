import { describe, expect, it } from "vitest";
import {
  collectionSlugFromUri,
  filterCategoriesByNonEmptySlugs,
  filterMenuItemsByNonEmptyCollections,
} from "@/lib/hide-empty-collections";

describe("collectionSlugFromUri", () => {
  it("extracts storefront collection slugs", () => {
    expect(collectionSlugFromUri("/collections/chairs")).toBe("chairs");
    expect(collectionSlugFromUri("/collections/outdoor%20seating")).toBe(
      "outdoor seating",
    );
  });

  it("extracts WooCommerce category permalinks", () => {
    expect(
      collectionSlugFromUri("https://shop.example/product-category/tables"),
    ).toBe("tables");
  });

  it("returns null for non-collection destinations", () => {
    expect(collectionSlugFromUri("/shop")).toBeNull();
    expect(collectionSlugFromUri("/products/sofa")).toBeNull();
    expect(collectionSlugFromUri("https://example.com")).toBeNull();
    expect(collectionSlugFromUri(null)).toBeNull();
  });
});

describe("filterCategoriesByNonEmptySlugs", () => {
  it("keeps only categories present in the non-empty set", () => {
    const filtered = filterCategoriesByNonEmptySlugs(
      [{ slug: "chairs" }, { slug: "empty-cat" }, { slug: "tables" }],
      new Set(["chairs", "tables"]),
    );
    expect(filtered.map((c) => c.slug)).toEqual(["chairs", "tables"]);
  });
});

describe("filterMenuItemsByNonEmptyCollections", () => {
  it("drops empty collection links and keeps pages", () => {
    const filtered = filterMenuItemsByNonEmptyCollections(
      [
        {
          id: "1",
          label: "Chairs",
          uri: "/collections/chairs",
          children: [],
        },
        {
          id: "2",
          label: "Empty",
          uri: "/collections/empty-cat",
          children: [],
        },
        {
          id: "3",
          label: "About",
          uri: "/about",
          children: [],
        },
      ],
      new Set(["chairs"]),
    );
    expect(filtered.map((i) => i.label)).toEqual(["Chairs", "About"]);
  });

  it("filters nested collection children", () => {
    const filtered = filterMenuItemsByNonEmptyCollections(
      [
        {
          id: "1",
          label: "Shop",
          uri: "/shop",
          children: [
            {
              id: "1a",
              label: "Chairs",
              uri: "/collections/chairs",
              children: [],
            },
            {
              id: "1b",
              label: "Empty",
              uri: "/collections/empty-cat",
              children: [],
            },
          ],
        },
      ],
      new Set(["chairs"]),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.map((c) => c.label)).toEqual(["Chairs"]);
  });
});
