import { describe, expect, it } from "vitest";

import {
  resolveShopPath,
  shopSegmentsFromPath,
  uriToRelativePath,
  type ShopCategoryNode,
} from "./shop-slug";

/**
 * Guards RESEARCH C-6 / D-15-04.
 *
 * The replaced implementation took `slug[slug.length - 1]` unconditionally and
 * could not tell a product slug from a category slug, so every `/shop/{cat}`
 * URL 308'd into a product route that answered not-found. These cases pin the
 * replacement: category-vs-product is decided from the category tree, and a
 * path that cannot be decided is an explicit `unknown` rather than a guess.
 */

const TREE: ShopCategoryNode[] = [
  {
    slug: "clothing",
    children: [
      { slug: "hoodies", children: [{ slug: "zip-up" }] },
      { slug: "tees" },
    ],
  },
  { slug: "accessories" },
  // WooCommerce default category — excluded by the sitemap walk, so excluded here.
  { slug: "uncategorised" },
  { slug: "uncategorized" },
];

describe("resolveShopPath", () => {
  it("classifies a nested child category as a category", () => {
    expect(
      resolveShopPath(["clothing", "hoodies"], TREE),
      "a category URL under /shop must resolve as a category — classifying it as a product is RESEARCH C-6, the 308-into-404 defect",
    ).toEqual({
      kind: "category",
      categorySlug: "hoodies",
      segments: ["clothing", "hoodies"],
    });
  });

  it("classifies a valid category chain plus a trailing slug as a product", () => {
    expect(
      resolveShopPath(["clothing", "hoodies", "blue-hoodie"], TREE),
      "a nested PDP URL must resolve as a product carrying its category chain — this is the URL shape D-15-04 preserves",
    ).toEqual({
      kind: "product",
      productSlug: "blue-hoodie",
      categorySegments: ["clothing", "hoodies"],
    });
  });

  it("classifies an invalid leading chain as unknown and does NOT guess a product", () => {
    expect(
      resolveShopPath(["not-a-category", "blue-hoodie"], TREE),
      "leading segments that are not a category chain must be unknown — returning a product here reproduces the last-segment bug in a new shape",
    ).toEqual({ kind: "unknown", segment: "not-a-category" });

    expect(
      resolveShopPath(["clothing", "not-a-category", "blue-hoodie"], TREE)
        .kind,
      "a chain that breaks mid-way must be unknown, naming the segment that broke it",
    ).toBe("unknown");
  });

  it("classifies a single non-category segment as a product with an empty chain", () => {
    expect(
      resolveShopPath(["blue-hoodie"], TREE),
      "a bare /shop/{slug} must still reach the product view — regressing this drops flat shop PDPs",
    ).toEqual({
      kind: "product",
      productSlug: "blue-hoodie",
      categorySegments: [],
    });
  });

  it("classifies zero segments as the shop index", () => {
    expect(
      resolveShopPath([], TREE),
      "an empty segment array is the /shop index, never a product lookup for the empty string",
    ).toEqual({ kind: "index" });
  });

  it("excludes the uncategorised category in both spellings", () => {
    expect(
      resolveShopPath(["uncategorised", "blue-hoodie"], TREE),
      "uncategorised is excluded by the sitemap walk and must be excluded here too, or the two drift",
    ).toEqual({ kind: "unknown", segment: "uncategorised" });

    expect(
      resolveShopPath(["uncategorized", "blue-hoodie"], TREE),
      "the American spelling must be excluded identically — WooCommerce ships either depending on locale",
    ).toEqual({ kind: "unknown", segment: "uncategorized" });

    expect(
      resolveShopPath(["uncategorised"], TREE).kind,
      "uncategorised must never be classified as a category",
    ).not.toBe("category");
  });

  it("is case-sensitive on slugs and rejects empty segments", () => {
    expect(
      resolveShopPath(["Clothing", "hoodies"], TREE),
      "slug matching is case-sensitive — a case-folded match would resolve URLs WordPress does not serve",
    ).toEqual({ kind: "unknown", segment: "Clothing" });

    expect(
      resolveShopPath(["clothing", ""], TREE),
      "an empty trailing segment must not become a product lookup for the empty string",
    ).toEqual({ kind: "unknown", segment: "" });
  });

  it("resolves a three-segment nested category chain and a product beneath it", () => {
    expect(
      resolveShopPath(["clothing", "hoodies", "zip-up"], TREE),
      "a three-deep category chain must resolve as a category, not as a product named after its deepest category",
    ).toEqual({
      kind: "category",
      categorySlug: "zip-up",
      segments: ["clothing", "hoodies", "zip-up"],
    });

    expect(
      resolveShopPath(["clothing", "hoodies", "zip-up", "navy-zip"], TREE),
      "a product beneath a three-deep chain must resolve as a product — longest-chain-first matching",
    ).toEqual({
      kind: "product",
      productSlug: "navy-zip",
      categorySegments: ["clothing", "hoodies", "zip-up"],
    });
  });
});

describe("uriToRelativePath", () => {
  it("returns a site-relative path unchanged", () => {
    expect(
      uriToRelativePath("/shop/clothing/blue-hoodie/"),
      "an already-relative permalink must pass through untouched",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("keeps only the path of an absolute permalink, whatever its origin", () => {
    // THE load-bearing case. Product.uri is documented relative but the Go
    // mapper assigns the absolute WooCommerce permalink, and in headless the
    // WordPress origin is a DIFFERENT host from the storefront by design.
    expect(
      uriToRelativePath("https://commerce.example.com/shop/clothing/blue-hoodie/"),
      "the WordPress backend origin must be discarded, not compared to the storefront origin — comparing would reject every product in every headless store",
    ).toBe("/shop/clothing/blue-hoodie/");
  });

  it("discards a foreign origin rather than propagating it", () => {
    expect(
      uriToRelativePath("https://attacker.example/shop/x"),
      "an absolute permalink must never survive with its origin — the caller re-roots the path under the site url, so an off-site entry is impossible by construction",
    ).toBe("/shop/x");
  });

  it("rejects a protocol-relative permalink", () => {
    expect(
      uriToRelativePath("//attacker.example/shop/x"),
      "a protocol-relative permalink looks path-like but resolves off-site when joined to a base url — it must be rejected outright",
    ).toBeNull();
  });

  it("rejects a non-http scheme", () => {
    expect(
      uriToRelativePath("javascript:alert(1)"),
      "only http(s) permalinks may yield a path",
    ).toBeNull();
  });

  it("rejects empty or blank input", () => {
    expect(uriToRelativePath(""), "empty permalink yields no path").toBeNull();
    expect(
      uriToRelativePath("   "),
      "blank permalink yields no path",
    ).toBeNull();
  });
});

describe("shopSegmentsFromPath", () => {
  it("strips the shop prefix and the surrounding separators", () => {
    expect(
      shopSegmentsFromPath("/shop/clothing/hoodies/blue-hoodie/"),
      "the segment array handed to /shop/[...slug] excludes the shop prefix itself and any empty separator segments",
    ).toEqual(["clothing", "hoodies", "blue-hoodie"]);
  });

  it("returns an empty array for a path outside the shop prefix", () => {
    // Fleet safety: a store whose WooCommerce permalink base is /product/
    // has NO route that serves that path. Returning [] is what makes the
    // caller fall back to the flat, always-served /products/{slug}.
    expect(
      shopSegmentsFromPath("/product/blue-hoodie/"),
      "a non-shop permalink must yield no segments, so callers never advertise or prerender a path this app does not serve",
    ).toEqual([]);

    expect(
      shopSegmentsFromPath("/"),
      "the bare root yields no shop segments",
    ).toEqual([]);
  });

  it("returns an empty array for the bare shop archive", () => {
    expect(
      shopSegmentsFromPath("/shop/"),
      "/shop itself is served by app/shop/page.tsx, not by the catch-all",
    ).toEqual([]);
  });
});
