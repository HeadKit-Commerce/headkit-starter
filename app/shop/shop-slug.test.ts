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
 * path that IS a valid category chain never reaches a product lookup — which
 * is the half that must never weaken. A path that is NOT a valid chain takes
 * the product reading, and the product lookup is what rejects garbage.
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
      categorySegments: ["clothing", "hoodies"],
      candidates: [{ productSlug: "blue-hoodie", ancestryValidated: true }],
    });
  });

  it("classifies a category chain plus a product and its colourway", () => {
    expect(
      resolveShopPath(["clothing", "hoodies", "blue-hoodie", "red"], TREE),
      "colourway URLs moved into this namespace with the base PDP, so a chain + product + colour must resolve rather than 404",
    ).toEqual({
      kind: "product",
      categorySegments: ["clothing", "hoodies"],
      candidates: [
        {
          productSlug: "blue-hoodie",
          colourSlug: "red",
          ancestryValidated: true,
        },
        // The containment reading of the same tail, in case the tree is
        // truncated and `blue-hoodie` is really an ancestor. A GUESS, so it
        // carries `ancestryValidated: false` and the route serves it only when
        // the resolved product's own permalink reproduces the path.
        { productSlug: "red", ancestryValidated: false },
      ],
    });

    expect(
      resolveShopPath(["blue-hoodie", "red"], TREE),
      "a store whose permalink base carries no category still gets colourway URLs — /shop/{slug}/{colour}",
    ).toEqual({
      kind: "product",
      categorySegments: [],
      candidates: [
        {
          productSlug: "blue-hoodie",
          colourSlug: "red",
          ancestryValidated: true,
        },
        { productSlug: "red", ancestryValidated: false },
      ],
    });
  });

  it("reads a two-segment remainder as product + colourway, never as a category", () => {
    // The two segments left over after the longest valid chain are read as a
    // product and its colourway. That is a DELIBERATE change from the earlier
    // "unknown": once colourway URLs live in this namespace the two readings —
    // "product with a colourway" and "garbage" — are indistinguishable from the
    // path alone, and the product lookup is what separates them. A slug that is
    // not a product resolves to null and the caller answers not-found, which is
    // the same page `unknown` produced; the cost is one cached lookup on a junk
    // URL, and a bare `/shop/{junk}` already paid that.
    //
    // What must NOT change, and is asserted above and below, is that a path
    // which IS a valid category chain never reaches a product lookup — that
    // lookup returning null is what produced the 308-into-404 of RESEARCH C-6.
    expect(resolveShopPath(["not-a-category", "blue-hoodie"], TREE)).toEqual({
      kind: "product",
      categorySegments: [],
      candidates: [
        {
          productSlug: "not-a-category",
          colourSlug: "blue-hoodie",
          ancestryValidated: true,
        },
        { productSlug: "blue-hoodie", ancestryValidated: false },
      ],
    });

    expect(
      resolveShopPath(["clothing", "not-a-category", "blue-hoodie"], TREE),
      "the valid part of the chain is still consumed as ancestry — only the remainder is read as product + colourway",
    ).toEqual({
      kind: "product",
      categorySegments: ["clothing"],
      candidates: [
        {
          productSlug: "not-a-category",
          colourSlug: "blue-hoodie",
          ancestryValidated: true,
        },
        { productSlug: "blue-hoodie", ancestryValidated: false },
      ],
    });
  });

  it("still resolves a product whose ancestry was PROMOTED OUT of the tree", () => {
    // The promoted-orphan shape: commerce builds the forest from WooCommerce's
    // un-paginated, `hide_empty=true` category list, so a child whose parent
    // fell outside that page is promoted to a ROOT with no ancestors — `zip-up`
    // here, whose real parent `hoodies` is absent. WordPress still mints the
    // product's permalink through the true chain, so `productPath`, the
    // canonical, the sitemap and the 308 from `/products/{slug}` all name
    // `/shop/hoodies/zip-up/blue-hoodie`. Refusing that as undecidable left the
    // product with NO working address, because the flat URL now redirects onto
    // it. Containment only — see the branch comment in `shop-slug.ts` and
    // `260822-commerce-category-list-orphan-promotion`.
    const truncated: ShopCategoryNode[] = [
      { slug: "clothing", children: [{ slug: "tees" }] },
      { slug: "zip-up" },
    ];

    expect(
      resolveShopPath(["hoodies", "zip-up", "blue-hoodie"], truncated),
      "a product whose permalink ancestry is not in the truncated tree must still reach the product view — 404ing it removes the last URL that served the product",
    ).toEqual({
      kind: "product",
      categorySegments: [],
      candidates: [
        { productSlug: "blue-hoodie", ancestryValidated: false },
        {
          productSlug: "zip-up",
          colourSlug: "blue-hoodie",
          ancestryValidated: false,
        },
      ],
    });
  });

  it("still offers the COLOURWAY reading of a promoted-orphan path", () => {
    // Same truncated tree, but the URL carries a colourway. `productPath`
    // appends the colour to the same unresolvable ancestry, so this shape is
    // every swatch href, every `hasVariant[].offers.url`, and the 308 target of
    // `/products/{slug}/{colour}` — and reading ONLY the last segment made the
    // COLOUR the product slug, so the lookup missed and a URL that used to
    // serve 200 began redirecting permanently onto a 404.
    const truncated: ShopCategoryNode[] = [
      { slug: "clothing", children: [{ slug: "tees" }] },
      { slug: "zip-up" },
    ];

    expect(
      resolveShopPath(["hoodies", "zip-up", "blue-hoodie", "red"], truncated),
      "the colourway reading must be offered too — the caller resolves the ambiguity against the catalogue, and without this candidate every colourway URL on a truncated-tree store 404s",
    ).toEqual({
      kind: "product",
      categorySegments: [],
      candidates: [
        { productSlug: "red", ancestryValidated: false },
        {
          productSlug: "blue-hoodie",
          colourSlug: "red",
          ancestryValidated: false,
        },
      ],
    });
  });

  it("offers both readings, base first, when the chain cannot be validated", () => {
    expect(
      resolveShopPath(["clothing", "a", "b", "c"], TREE),
      "the leading segments are an ancestry claim this tree cannot confirm, so the catalogue lookup decides — base PDP first, then product + colourway",
    ).toEqual({
      kind: "product",
      categorySegments: ["clothing"],
      candidates: [
        { productSlug: "c", ancestryValidated: false },
        { productSlug: "b", colourSlug: "c", ancestryValidated: false },
      ],
    });
  });

  it("exposes only the VALIDATED chain as ancestry, never the guessed segments", () => {
    const resolved = resolveShopPath(["clothing", "a", "b", "c"], TREE);

    expect(
      resolved.kind === "product" ? resolved.categorySegments : null,
      "`a` and `b` name categories this tree does not contain, so handing them out as ancestry would let a consumer build breadcrumbs or a canonical for paths that do not resolve — only the part the tree confirmed may be exposed",
    ).toEqual(["clothing"]);

    expect(
      resolved.kind === "product"
        ? resolved.candidates.every((c) => !c.ancestryValidated)
        : null,
      "every reading of this path consumes an unconfirmed segment, so none may be served without the permalink check",
    ).toBe(true);
  });

  it("classifies a single non-category segment as a product with an empty chain", () => {
    expect(
      resolveShopPath(["blue-hoodie"], TREE),
      "a bare /shop/{slug} must still reach the product view — regressing this drops flat shop PDPs",
    ).toEqual({
      kind: "product",
      categorySegments: [],
      candidates: [{ productSlug: "blue-hoodie", ancestryValidated: true }],
    });
  });

  it("classifies zero segments as the shop index", () => {
    expect(
      resolveShopPath([], TREE),
      "an empty segment array is the /shop index, never a product lookup for the empty string",
    ).toEqual({ kind: "index" });
  });

  it("treats the uncategorised category as ancestry but never as an archive", () => {
    // The two halves pull in opposite directions and both matter.
    //
    // NOT an archive: `/shop/uncategorised` is not a browsable page, so it must
    // never resolve as a category.
    //
    // Still ANCESTRY: WordPress files an uncategorised product under it and
    // mints `/shop/uncategorised/{slug}` as that product's real permalink —
    // which is what `productPath` returns, every internal link renders, the
    // canonical names and the sitemap advertises. Refusing it as ancestry made
    // the whole family 404: the chain matched nothing, the two leftover
    // segments were read as product + colourway, and the lookup for
    // `uncategorised` returned null. Uncategorised is WooCommerce's DEFAULT, so
    // that is every product a merchant has not filed.
    //
    // Both spellings ship depending on WordPress locale.
    for (const spelling of ["uncategorised", "uncategorized"]) {
      expect(
        resolveShopPath([spelling, "blue-hoodie"], TREE),
        "an uncategorised product's own permalink must resolve to that product, not 404",
      ).toEqual({
        kind: "product",
        categorySegments: [spelling],
        candidates: [{ productSlug: "blue-hoodie", ancestryValidated: true }],
      });

      expect(
        resolveShopPath([spelling], TREE),
        "the excluded term is valid ANCESTRY but not a browsable archive, so the chain consumes the whole path and leaves NO product slug — an explicit failure to decide. Reading a slug off the empty remainder produced `undefined`, which reached the catalogue as a GetProduct query with the variable absent",
      ).toEqual({ kind: "unknown", segment: spelling });
    }
  });

  it("is case-sensitive on slugs and rejects empty segments", () => {
    const cased = resolveShopPath(["Clothing", "hoodies"], TREE);
    expect(
      cased.kind,
      "slug matching is case-sensitive — a case-folded match would resolve URLs WordPress does not serve, so `Clothing` must never be consumed as a category",
    ).not.toBe("category");
    expect(cased.kind === "product" ? cased.categorySegments : null).toEqual(
      [],
    );
    expect(
      cased.kind === "product" ? cased.candidates[0]?.productSlug : null,
      "the whole path falls through to a product reading rather than a category one",
    ).toBe("Clothing");

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
      categorySegments: ["clothing", "hoodies", "zip-up"],
      candidates: [{ productSlug: "navy-zip", ancestryValidated: true }],
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
      uriToRelativePath(
        "https://commerce.example.com/shop/clothing/blue-hoodie/",
      ),
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
