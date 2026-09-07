import { describe, expect, it } from "vitest";
import {
  collectionSlugsForSurface,
  pickCollectionsBySlugs,
} from "@/lib/collection-surfaces";

describe("collectionSlugsForSurface", () => {
  it("returns null when catalog or the surface key is omitted", () => {
    expect(collectionSlugsForSurface(undefined, "homepage")).toBeNull();
    expect(collectionSlugsForSurface({}, "homepage")).toBeNull();
    expect(collectionSlugsForSurface({}, "shop")).toBeNull();
    expect(
      collectionSlugsForSurface({ homepageCollections: [] }, "homepage"),
    ).toBeNull();
  });

  it("returns the ordered slugs for the requested surface only", () => {
    const catalog = {
      homepageCollections: ["monogram", "bundles"],
      shopCollections: ["bundles"],
    };
    expect(collectionSlugsForSurface(catalog, "homepage")).toEqual([
      "monogram",
      "bundles",
    ]);
    expect(collectionSlugsForSurface(catalog, "shop")).toEqual(["bundles"]);
  });
});

describe("pickCollectionsBySlugs", () => {
  const items = [
    { slug: "gift-cards", name: "Gift Cards" },
    { slug: "Monogram", name: "Monogram" },
    { slug: "frontpage", name: "Home" },
    { slug: "bundles", name: "Bundles" },
  ];

  it("passes through when there is no allowlist", () => {
    expect(pickCollectionsBySlugs(items, null)).toEqual(items);
    expect(pickCollectionsBySlugs(items, [])).toEqual(items);
  });

  it("keeps allowlist order and skips unknown slugs", () => {
    expect(
      pickCollectionsBySlugs(items, ["bundles", "missing", "monogram"]),
    ).toEqual([
      { slug: "bundles", name: "Bundles" },
      { slug: "Monogram", name: "Monogram" },
    ]);
  });
});
