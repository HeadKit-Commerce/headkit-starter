import { describe, expect, it } from "vitest";

import {
  applyCanonicalCollectionHrefs,
  canonicalCollectionHref,
  type CollectionPathLookup,
} from "@/lib/menu-canonical-href";

/**
 * The PURE half of the CMS-menu href rewrite (`lib/menu-canonical-href.ts`).
 *
 * WHAT THIS COVERS: the rule itself — which hrefs are re-derived from the
 * category tree, which are left exactly as they arrived, and what happens to a
 * facet tail or a query string.
 *
 * WHAT IT DOES NOT COVER, and what does:
 *  - that the header and footer menus actually run this over their items, and
 *    that a category change purges them — `navigation-wrapper.test.ts`
 *    ("category hrefs are re-derived from the tree"), which drives the real
 *    `NavigationWrapper` / `getFooterMenus` / `fetchMenu` chain;
 *  - that the lookup a caller supplies is built from the SAME walk the sitemap
 *    uses — `collectionPathIndex` in `lib/collection-path.ts`;
 *  - that the rewritten href reaches the SERVED HTML, and that the hop is gone.
 *    Neither is observable from a unit test: that is an HTTP read against a
 *    running store.
 */

const TREE: Record<string, string> = {
  apparel: "/collections/apparel",
  socks: "/collections/apparel/socks",
  "t-shirts": "/collections/apparel/t-shirts",
  hats: "/collections/hats",
  "sun-hats": "/collections/hats/sun-hats",
};

const lookup: CollectionPathLookup = (slug) => TREE[slug];

describe("canonicalCollectionHref — re-derives a category href from the tree", () => {
  it("nests a flat CHILD category href", () => {
    expect(canonicalCollectionHref("/collections/socks", lookup)).toBe(
      "/collections/apparel/socks",
    );
  });

  it("leaves a ROOT category href alone — flat IS canonical there", () => {
    expect(canonicalCollectionHref("/collections/hats", lookup)).toBe(
      "/collections/hats",
    );
  });

  it("is idempotent on an already-canonical nested href", () => {
    expect(canonicalCollectionHref("/collections/apparel/socks", lookup)).toBe(
      "/collections/apparel/socks",
    );
  });

  it("re-derives from the LEAF, correcting a wrong ancestor", () => {
    expect(canonicalCollectionHref("/collections/hats/socks", lookup)).toBe(
      "/collections/apparel/socks",
    );
  });

  it("decodes a percent-encoded slug (the theme rawurlencodes it)", () => {
    expect(canonicalCollectionHref("/collections/t%2Dshirts", lookup)).toBe(
      "/collections/apparel/t-shirts",
    );
  });
});

describe("canonicalCollectionHref — what it must never touch", () => {
  it.each([
    ["an external link", "https://example.com/social/"],
    ["a tel: link", "tel:1300000000"],
    ["a mega-menu column container", "/"],
    ["the catalogue index", "/shop"],
    ["a CMS page", "/about-us"],
    ["a product", "/shop/apparel/socks/merino-crew"],
    ["a bare /collections", "/collections"],
  ])("leaves %s unchanged", (_label, uri) => {
    expect(canonicalCollectionHref(uri, lookup)).toBe(uri);
  });

  it("leaves a slug the tree does not contain EXACTLY as it arrived", () => {
    // Not `/collections/club-kit`: passing an unknown slug through
    // `collectionPathResolver`'s fallback would FLATTEN a hand-authored nested
    // href, which is a worse bug than the redirect hop this module removes.
    expect(
      canonicalCollectionHref("/collections/custom-apparel/club-kit", lookup),
    ).toBe("/collections/custom-apparel/club-kit");
  });

  it("returns '' for an absent href rather than throwing", () => {
    expect(canonicalCollectionHref(undefined, lookup)).toBe("");
  });
});

describe("canonicalCollectionHref — facet tails and query strings survive", () => {
  it("re-derives only the category part of an indexable facet URL", () => {
    expect(
      canonicalCollectionHref("/collections/socks/f/colour.black", lookup),
    ).toBe("/collections/apparel/socks/f/colour.black");
  });

  it("keeps a query string and a fragment", () => {
    expect(
      canonicalCollectionHref("/collections/socks?sort=price#grid", lookup),
    ).toBe("/collections/apparel/socks?sort=price#grid");
  });
});

describe("applyCanonicalCollectionHrefs — whole tree, every other field kept", () => {
  it("rewrites at every depth and preserves labels, classes and order", () => {
    const items = [
      {
        id: "1",
        label: "Clothing",
        uri: "/",
        cssClasses: [],
        children: [
          {
            id: "2",
            label: "Column 1",
            uri: "/",
            cssClasses: ["hidden"],
            children: [
              {
                id: "3",
                label: "Apparel",
                uri: "/collections/apparel",
                cssClasses: ["hk-collection:apparel"],
                children: [
                  {
                    id: "4",
                    label: "Socks",
                    uri: "/collections/socks",
                    cssClasses: ["hk-collection:socks"],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const out = applyCanonicalCollectionHrefs(items, lookup);
    const socks = out[0]?.children?.[0]?.children?.[0]?.children?.[0];
    expect(socks?.uri).toBe("/collections/apparel/socks");
    expect(socks?.label).toBe("Socks");
    expect(socks?.cssClasses).toEqual(["hk-collection:socks"]);
    // The column container keeps its `hidden` marker and its `/` destination,
    // so `lib/menu-columns.ts` still recognises it.
    expect(out[0]?.children?.[0]?.uri).toBe("/");
    expect(out[0]?.children?.[0]?.cssClasses).toEqual(["hidden"]);
    // Input untouched — the rewrite returns new nodes.
    expect(items[0]?.children?.[0]?.children?.[0]?.children?.[0]?.uri).toBe(
      "/collections/socks",
    );
  });

  it("keeps a curated landing page even when the item is class-marked a category", () => {
    // The theme stamps `hk-collection:{slug}` on taxonomy items, but a merchant
    // can set it by hand on a Custom Link pointing at a landing page. The rule
    // triggers on the URI shape, never on the class, so this link survives.
    const out = applyCanonicalCollectionHrefs(
      [
        {
          id: "1",
          label: "Socks",
          uri: "/sock-season",
          cssClasses: ["hk-collection:socks"],
          children: [],
        },
      ],
      lookup,
    );
    expect(out[0]?.uri).toBe("/sock-season");
  });
});
