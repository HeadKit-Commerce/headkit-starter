import { describe, expect, it } from "vitest";
import {
  collectionSlugFromMenuItem,
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
    expect(collectionSlugFromUri("/collections/chairs/")).toBe("chairs");
  });

  it("extracts the leaf slug from nested collection paths", () => {
    expect(collectionSlugFromUri("/collections/men/mens-shirts")).toBe(
      "mens-shirts",
    );
    expect(
      collectionSlugFromUri("/collections/furniture/seating/chairs/"),
    ).toBe("chairs");
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

describe("collectionSlugFromMenuItem", () => {
  it("prefers the hk-collection CSS class over the URI", () => {
    expect(
      collectionSlugFromMenuItem({
        uri: "/about",
        cssClasses: ["menu-item", "hk-collection:lounge-chairs"],
      }),
    ).toBe("lounge-chairs");
  });

  it("falls back to URI parsing when no marker class is present", () => {
    expect(
      collectionSlugFromMenuItem({
        uri: "/collections/men/mens-shirts",
        cssClasses: ["menu-item"],
      }),
    ).toBe("mens-shirts");
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

  it("drops nested empty leaf collections even when the parent path is non-empty", () => {
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
              uri: "/collections/furniture/chairs",
              children: [],
            },
            {
              id: "1b",
              label: "Empty",
              uri: "/collections/furniture/empty-cat",
              children: [],
            },
          ],
        },
      ],
      new Set(["chairs", "furniture"]),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.map((c) => c.label)).toEqual(["Chairs"]);
  });

  it("drops empty collections identified by hk-collection class", () => {
    const filtered = filterMenuItemsByNonEmptyCollections(
      [
        {
          id: "1",
          label: "Empty taxonomy item",
          uri: "/custom-landing",
          cssClasses: ["hk-collection:empty-cat"],
          children: [],
        },
        {
          id: "2",
          label: "Chairs",
          uri: "/custom-landing-chairs",
          cssClasses: ["hk-collection:chairs"],
          children: [],
        },
      ],
      new Set(["chairs"]),
    );
    expect(filtered.map((i) => i.label)).toEqual(["Chairs"]);
  });

  it("keeps an empty collection parent when non-empty children remain", () => {
    const filtered = filterMenuItemsByNonEmptyCollections(
      [
        {
          id: "1",
          label: "Furniture",
          uri: "/collections/furniture",
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
    expect(filtered[0]?.label).toBe("Furniture");
    expect(filtered[0]?.children?.map((c) => c.label)).toEqual(["Chairs"]);
  });
});
