import { describe, expect, it } from "vitest";

import {
  bridgeTags,
  invalidatesManyPages,
  isKnownTag,
  KNOWN_MENU_LOCATIONS,
  ROOT_LAYOUT_CHROME_TAGS,
  TAG,
  tagCoveringPath,
} from "./cache-tags";

/**
 * Cache-tag contract tests (CACHE-01).
 *
 * The bridge table below is the FULL SET-vs-FIRED remap from `00-GROUNDING.md`
 * §2 — every legacy tag WordPress fires today mapped to the contract tag(s) the
 * starter subscribes to. Each row is a single `it.each` case, so a missed or
 * regressed remap fails loudly. The `isKnownTag` matrix proves the strict
 * allowlist (threat T-09.5-01) and the dropped-count case proves an unknown tag
 * survives bridging but never reaches `revalidateTag` (threat T-09.5-02).
 */

describe("TAG builders emit the D2 taxonomy strings", () => {
  it("builds singular entity tags", () => {
    // SINGULAR — must match collections/[...slug]/page.tsx:77.
    expect(TAG.collection("hoodies")).toBe("headkit:collection:hoodies");
    expect(TAG.product("blue-tee")).toBe("headkit:product:blue-tee");
    expect(TAG.brand("nike")).toBe("headkit:brand:nike");
    expect(TAG.post("launch")).toBe("headkit:post:launch");
    expect(TAG.project("showroom")).toBe("headkit:project:showroom");
    expect(TAG.page("faq")).toBe("headkit:page:faq");
  });

  it("builds type/index constants", () => {
    expect(TAG.products).toBe("headkit:products");
    expect(TAG.collections).toBe("headkit:collections");
    expect(TAG.brands).toBe("headkit:brands");
    expect(TAG.posts).toBe("headkit:posts");
    expect(TAG.projects).toBe("headkit:projects");
    expect(TAG.pages).toBe("headkit:pages");
  });

  it("builds grid, chrome, route and global tags", () => {
    expect(TAG.catalogCat("shirts")).toBe("headkit:catalog:cat:shirts");
    expect(TAG.menu("PRIMARY")).toBe("headkit:menu:PRIMARY");
    expect(TAG.footer).toBe("headkit:footer");
    expect(TAG.branding).toBe("headkit:branding");
    expect(TAG.emailMarketing).toBe("headkit:email-marketing");
    expect(TAG.route("home")).toBe("headkit:route:home");
    expect(TAG.route("shop")).toBe("headkit:route:shop");
    expect(TAG.route("sale")).toBe("headkit:route:sale");
    expect(TAG.route("new")).toBe("headkit:route:new");
    expect(TAG.route("featured")).toBe("headkit:route:featured");
    expect(TAG.catalog).toBe("headkit:catalog");
    expect(TAG.settings).toBe("headkit:settings");
  });
});

// The authoritative 00-GROUNDING §2 legacy→contract mapping. `rawIsKnown` marks
// whether the raw input is itself a contract tag (passthrough) — used to drive
// the isKnownTag matrix below without a second table.
const REMAP_TABLE: ReadonlyArray<{
  name: string;
  raw: string;
  expected: string[];
  rawIsKnown: boolean;
}> = [
  {
    name: "menu (location-less) fans out to every location + footer",
    raw: "headkit:menu",
    expected: [
      "headkit:menu:PRIMARY",
      "headkit:menu:SECONDARY",
      "headkit:menu:PRE_HEADER",
      "headkit:menu:FOOTER",
      "headkit:menu:FOOTER_2",
      "headkit:menu:FOOTER_3",
      "headkit:menu:FOOTER_4",
      "headkit:menu:FOOTER_POLICY",
      "headkit:footer",
    ],
    rawIsKnown: false,
  },
  {
    name: "page:/ → route:home",
    raw: "headkit:page:/",
    expected: ["headkit:route:home"],
    rawIsKnown: false,
  },
  {
    name: "page:shop → route:shop",
    raw: "headkit:page:shop",
    expected: ["headkit:route:shop"],
    rawIsKnown: false,
  },
  {
    name: "carousel → route:home + pages",
    raw: "headkit:carousel",
    expected: ["headkit:route:home", "headkit:pages"],
    rawIsKnown: false,
  },
  {
    name: "new-in → route:new",
    raw: "headkit:new-in",
    expected: ["headkit:route:new"],
    rawIsKnown: false,
  },
  {
    name: "sale → route:sale",
    raw: "headkit:sale",
    expected: ["headkit:route:sale"],
    rawIsKnown: false,
  },
  {
    name: "plural collections:{slug} → singular collection:{slug}",
    raw: "headkit:collections:hoodies",
    expected: ["headkit:collection:hoodies"],
    rawIsKnown: false,
  },
  // Passthroughs — already contract form, returned unchanged (idempotent).
  {
    name: "product:{slug} passthrough",
    raw: "headkit:product:blue-tee",
    expected: ["headkit:product:blue-tee"],
    rawIsKnown: true,
  },
  {
    name: "collections index passthrough",
    raw: "headkit:collections",
    expected: ["headkit:collections"],
    rawIsKnown: true,
  },
  {
    name: "brand:{slug} passthrough",
    raw: "headkit:brand:nike",
    expected: ["headkit:brand:nike"],
    rawIsKnown: true,
  },
  {
    name: "brands index passthrough",
    raw: "headkit:brands",
    expected: ["headkit:brands"],
    rawIsKnown: true,
  },
  {
    name: "post:{slug} passthrough",
    raw: "headkit:post:launch",
    expected: ["headkit:post:launch"],
    rawIsKnown: true,
  },
  {
    name: "posts index passthrough",
    raw: "headkit:posts",
    expected: ["headkit:posts"],
    rawIsKnown: true,
  },
  {
    name: "page:{slug} (real CMS page) passthrough",
    raw: "headkit:page:faq",
    expected: ["headkit:page:faq"],
    rawIsKnown: true,
  },
];

describe("bridgeTags remaps the full SET-vs-FIRED table (00-GROUNDING §2)", () => {
  it.each(REMAP_TABLE)("$name", ({ raw, expected }) => {
    expect(bridgeTags([raw])).toEqual(expected);
  });

  it("is idempotent — bridging contract tags returns them unchanged", () => {
    const contract = ["headkit:route:home", "headkit:collection:hoodies"];
    expect(bridgeTags(contract)).toEqual(contract);
  });

  it("flattens 1→many expansions and de-duplicates across inputs", () => {
    // carousel and page:/ both expand to route:home — home appears once;
    // carousel also fans out to pages (CMS heroes).
    expect(bridgeTags(["headkit:carousel", "headkit:page:/"])).toEqual([
      "headkit:route:home",
      "headkit:pages",
    ]);
  });
});

describe("explicit chrome / composite fan-out", () => {
  it("headkit:menu fans out to every KNOWN_MENU_LOCATIONS + footer", () => {
    const expected = [
      ...KNOWN_MENU_LOCATIONS.map((loc) => TAG.menu(loc)),
      TAG.footer,
    ];
    expect(bridgeTags(["headkit:menu"])).toEqual(expected);
  });

  it("headkit:carousel bridges to route:home + pages", () => {
    expect(bridgeTags(["headkit:carousel"])).toEqual([
      TAG.route("home"),
      TAG.pages,
    ]);
  });
});

describe("isKnownTag strict allowlist (threat T-09.5-01)", () => {
  it.each(REMAP_TABLE)("accepts every bridged output of: $name", ({ raw }) => {
    for (const out of bridgeTags([raw])) {
      expect(isKnownTag(out)).toBe(true);
    }
  });

  it.each(REMAP_TABLE.filter((r) => !r.rawIsKnown))(
    "rejects the RAW legacy tag until bridged: $raw",
    ({ raw }) => {
      expect(isKnownTag(raw)).toBe(false);
    },
  );

  it.each(REMAP_TABLE.filter((r) => r.rawIsKnown))(
    "accepts the RAW contract tag as-is: $raw",
    ({ raw }) => {
      expect(isKnownTag(raw)).toBe(true);
    },
  );

  it("rejects garbage and empty-id tags", () => {
    expect(isKnownTag("garbage")).toBe(false);
    expect(isKnownTag("headkit:unknown:x")).toBe(false);
    expect(isKnownTag("headkit:product:")).toBe(false); // empty id
    expect(isKnownTag("headkit:menu")).toBe(false); // location-less raw legacy
    expect(isKnownTag("headkit:collections:hoodies")).toBe(false); // plural raw
  });
});

describe("dropped-count path (threat T-09.5-02 — matches route 09.5-02)", () => {
  it("an unbridgeable unknown tag survives bridging but fails isKnownTag", () => {
    const raw = ["headkit:unknown:x"];
    const bridged = bridgeTags(raw);
    const kept = bridged.filter(isKnownTag);
    expect(raw).toHaveLength(1);
    expect(kept).toHaveLength(0);
    // dropped = raw.length - kept.length = the route's `dropped` metric.
    expect(raw.length - kept.length).toBe(1);
  });
});

/**
 * Parity guard — the canonical set of TAG string prefixes / exact strings.
 *
 * TODO(09.5-06): the WP PHP constant mirror (`HK_TAG_*` in
 * `inc/headkit-cache-tags.php`) MUST match this list string-for-string. When
 * 09.5-06 lands, snapshot the PHP constants and assert equality against this
 * array so a drift on either side fails loudly.
 */
const EXPECTED_TAG_SHAPE: readonly string[] = [
  "headkit:product:",
  "headkit:collection:",
  "headkit:brand:",
  "headkit:post:",
  "headkit:project:",
  "headkit:page:",
  "headkit:products",
  "headkit:collections",
  "headkit:brands",
  "headkit:posts",
  "headkit:projects",
  "headkit:pages",
  "headkit:catalog:cat:",
  "headkit:menu:",
  "headkit:footer",
  "headkit:branding",
  "headkit:email-marketing",
  "headkit:route:",
  "headkit:catalog",
  "headkit:settings",
];

describe("TAG taxonomy parity guard (anchors the 09.5-06 PHP mirror)", () => {
  it("emits exactly the expected prefix/exact-string shape", () => {
    const actual = [
      TAG.product("x").replace(/x$/, ""),
      TAG.collection("x").replace(/x$/, ""),
      TAG.brand("x").replace(/x$/, ""),
      TAG.post("x").replace(/x$/, ""),
      TAG.project("x").replace(/x$/, ""),
      TAG.page("x").replace(/x$/, ""),
      TAG.products,
      TAG.collections,
      TAG.brands,
      TAG.posts,
      TAG.projects,
      TAG.pages,
      TAG.catalogCat("x").replace(/x$/, ""),
      TAG.menu("X").replace(/X$/, ""),
      TAG.footer,
      TAG.branding,
      TAG.emailMarketing,
      TAG.route("home").replace(/home$/, ""),
      TAG.catalog,
      TAG.settings,
    ];
    expect(actual).toEqual(EXPECTED_TAG_SHAPE);
  });
});

/**
 * Blast-radius classification.
 *
 * `invalidatesManyPages` decides which purge semantic the webhook route uses,
 * so getting a tag on the wrong side is either a cold render on thousands of
 * pages (narrow when it should be wide) or an editor seeing an unchanged page
 * after saving it (wide when it should be narrow).
 *
 * The keyed `Record<keyof typeof TAG, string>` plus the key-coverage case below
 * are what make this exhaustive: a tag added to `TAG` fails the typecheck until
 * it has a sample, and fails this suite until it is deliberately placed in one
 * of the two lists. It does NOT observe the route, the CDN or any cache header
 * — `app/api/revalidate/route.test.ts` covers the wiring, and only a live
 * deployment can show `x-vercel-cache: STALE`.
 */
const SAMPLE_TAG: Record<keyof typeof TAG, string> = {
  product: TAG.product("blue-tee"),
  collection: TAG.collection("bikes"),
  brand: TAG.brand("specialized"),
  post: TAG.post("launch"),
  project: TAG.project("showroom"),
  client: TAG.client("acme"),
  page: TAG.page("about"),
  products: TAG.products,
  collections: TAG.collections,
  brands: TAG.brands,
  posts: TAG.posts,
  projects: TAG.projects,
  clients: TAG.clients,
  pages: TAG.pages,
  catalogCat: TAG.catalogCat("bikes"),
  menu: TAG.menu("PRIMARY"),
  footer: TAG.footer,
  branding: TAG.branding,
  emailMarketing: TAG.emailMarketing,
  route: TAG.route("home"),
  catalog: TAG.catalog,
  settings: TAG.settings,
};

/**
 * Whole-catalogue / whole-route-family reach → invalidate rather than delete.
 *
 * `brands` is here because `lib/product-brand.ts` subscribes the PDP brand
 * logo read to it and tags propagate outward onto the awaiting route's CDN
 * entry, so it reaches every PDP on the store. The classification is not
 * cosmetic: a narrow `headkit:brands` would DELETE every one of those entries
 * on a brand-term edit.
 */
const WIDE_KEYS = [
  "products",
  "collections",
  "catalog",
  "catalogCat",
  "route",
  "brands",
  // Layout chrome: each is carried by a read the ROOT LAYOUT awaits, so it
  // sits on every CDN entry in the storefront.
  "menu",
  "footer",
  "branding",
  "emailMarketing",
  "settings",
] as const satisfies readonly (keyof typeof TAG)[];

/** One page or one index, checked by an editor right after a save → delete. */
const NARROW_KEYS = [
  "product",
  "collection",
  "brand",
  "post",
  "project",
  "client",
  "page",
  "posts",
  "projects",
  "clients",
  "pages",
] as const satisfies readonly (keyof typeof TAG)[];

describe("blast-radius classification covers the whole TAG contract", () => {
  it("places every TAG member in exactly one class", () => {
    const classified = [...WIDE_KEYS, ...NARROW_KEYS];
    expect([...classified].sort()).toEqual(Object.keys(TAG).sort());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it.each(WIDE_KEYS)("TAG.%s is wide (invalidate)", (key) => {
    expect(invalidatesManyPages(SAMPLE_TAG[key])).toBe(true);
  });

  it.each(NARROW_KEYS)("TAG.%s is narrow (delete immediately)", (key) => {
    expect(invalidatesManyPages(SAMPLE_TAG[key])).toBe(false);
  });

  it("classifies the wildcard-shaped families by prefix, not by literal", () => {
    // A slug never seen before must still classify — the route receives these
    // from WordPress, one per category / landing of the saved product.
    expect(invalidatesManyPages("headkit:catalog:cat:road-bikes")).toBe(true);
    expect(invalidatesManyPages("headkit:route:shop")).toBe(true);
    expect(invalidatesManyPages("headkit:route:featured")).toBe(true);
    expect(invalidatesManyPages("headkit:collection:road-bikes")).toBe(false);
    expect(invalidatesManyPages("headkit:page:size-guide")).toBe(false);
    expect(invalidatesManyPages("headkit:post:mid-year-sale")).toBe(false);
    // Every menu LOCATION is wide, including one this repo does not enumerate:
    // `KNOWN_MENU_LOCATIONS` is our list, not WordPress's.
    expect(invalidatesManyPages("headkit:menu:FOOTER_POLICY")).toBe(true);
    expect(invalidatesManyPages("headkit:menu:SOME_NEW_LOCATION")).toBe(true);
  });

  it("does not let a bare prefix or a lookalike tag read as wide", () => {
    // `headkit:catalog` itself IS wide, but an empty id after the prefix is not
    // a contract tag at all (`isKnownTag` already drops it) and must not be
    // widened by the prefix rule.
    expect(invalidatesManyPages("headkit:catalog:")).toBe(false);
    expect(invalidatesManyPages("headkit:route:")).toBe(false);
    expect(invalidatesManyPages("headkit:menu:")).toBe(false);
    // Not contract tags; they never reach the route, but must not match either.
    expect(invalidatesManyPages("headkit:routes:home")).toBe(false);
    expect(invalidatesManyPages("headkit:products:blue-tee")).toBe(false);
    expect(invalidatesManyPages("headkit:menus:PRIMARY")).toBe(false);
  });

  /**
   * The two brand tags, pinned by name because they are one character apart
   * and sit on OPPOSITE sides of the class boundary — the generic `it.each`
   * rows above say the same thing but read as boilerplate, and this is the
   * pair a future edit is most likely to "tidy" into agreement.
   *
   * It observes the pure predicate only. That the PDP read actually carries
   * the plural is `app/products/[...slug]/page.test.ts`; that the route then
   * routes the wide class through `invalidateByTag` is
   * `app/api/revalidate/route.test.ts`.
   */
  it("splits the two brand tags: the plural TERM tag is wide, the singular PRODUCT-SET tag stays narrow", () => {
    expect(
      invalidatesManyPages(TAG.brands),
      "headkit:brands is carried by lib/product-brand.ts, which every PDP awaits, so deleting it would delete every PDP entry on a brand-term edit",
    ).toBe(true);
    expect(
      invalidatesManyPages(TAG.brand("specialized")),
      "headkit:brand:{slug} reaches that brand's grid and PLP shell; deleting it is what keeps an editor's own brand page guaranteed-fresh",
    ).toBe(false);
  });

  /**
   * The layout-chrome class, pinned BY NAME and with a narrow control in the
   * same test.
   *
   * The `it.each` rows above already say each of these is wide, but they read
   * as boilerplate, and a change that "restored editor immediacy for the chrome
   * tags" would move a key between two lists and leave a green suite behind.
   * This case states WHY each one is wide — it is carried by a read
   * `app/layout.tsx` awaits — and fails with that sentence attached.
   *
   * The narrow control is the half a one-sided test would miss: a change that
   * made EVERY tag wide would satisfy the assertions above it.
   */
  it("classifies every ROOT-LAYOUT CHROME tag wide, and still classifies a page tag narrow", () => {
    for (const tag of ROOT_LAYOUT_CHROME_TAGS) {
      expect(
        invalidatesManyPages(tag),
        `${tag} is carried by a read app/layout.tsx awaits, so it sits on EVERY CDN entry; deleting it destroys the whole prerendered site`,
      ).toBe(true);
    }
    // Control: the classification must not have widened everything. A page
    // edit still DELETES that one page so the editor's next load is fresh.
    expect(
      invalidatesManyPages(TAG.page("size-guide")),
      "headkit:page:{slug} reaches one page an editor checks right after saving; widening it would cost editor immediacy for nothing",
    ).toBe(false);
    expect(invalidatesManyPages(TAG.post("mid-year-sale"))).toBe(false);
    expect(invalidatesManyPages(TAG.pages)).toBe(false);
  });
});

/**
 * `tagCoveringPath` — the rule that lets the route SKIP a `revalidatePath` the
 * same payload's tags already cover.
 *
 * What these cases hold: the pure mapping, in both directions, for every path
 * family the WordPress theme actually emits — a covered path resolves to the
 * covering tag, and an uncovered one resolves to `null` so the route still
 * purges it. The uncovered direction matters most: a page purged by neither a
 * path nor a tag is stale for the whole of its cache life, silently.
 *
 * What they CANNOT see, stated because the point of a guard is that people stop
 * looking once they see one:
 *   - that the theme really constructs each pair this way. That is a reading of
 *     `integrations/wordpress/theme/inc/headkit-webhook.php` (cited by function
 *     name in `tagCoveringPath`'s docblock), not something this suite executes.
 *   - that the covering tag is actually ON the CDN entry the path names. That
 *     is a property of this app's `cacheTag` call sites plus Vercel's tag index,
 *     observable only over HTTP against a deployment.
 *   - the WIRING — that the route consults this at all. That is
 *     `app/api/revalidate/route.test.ts`'s ("path classification").
 */
describe("tagCoveringPath — path coverage by a tag in the same payload", () => {
  it("covers a product path with the product entity tag", () => {
    expect(
      tagCoveringPath("/products/mountain-bike-helmet", [
        "headkit:product:mountain-bike-helmet",
        "headkit:products",
      ]),
    ).toBe("headkit:product:mountain-bike-helmet");
  });

  it("covers a NESTED collection path by its LEAF grid tag", () => {
    // The theme builds `/collections/<ancestors…>/<leaf>` from one `$term` and
    // tags `headkit:catalog:cat:<leaf>` from the same `$term`.
    expect(
      tagCoveringPath("/collections/helmets/mountain-bike-helmets", [
        "headkit:catalog:cat:helmets",
        "headkit:catalog:cat:mountain-bike-helmets",
      ]),
    ).toBe("headkit:catalog:cat:mountain-bike-helmets");
  });

  it("accepts the collection ENTITY tag as cover on a listing event", () => {
    expect(
      tagCoveringPath("/collections/bikes", ["headkit:collection:bikes"]),
    ).toBe("headkit:collection:bikes");
  });

  it("does NOT accept an ANCESTOR's grid tag as cover for a deeper path", () => {
    // A parent tag does reach the child page in practice, but the skip rule
    // must stay derivable from the sender's construction rather than from a
    // reach argument — so this is deliberately uncovered.
    expect(
      tagCoveringPath("/collections/helmets/mountain-bike-helmets", [
        "headkit:catalog:cat:helmets",
      ]),
    ).toBeNull();
  });

  it("covers the project detail and index paths", () => {
    expect(
      tagCoveringPath("/projects/velodrome", ["headkit:project:velodrome"]),
    ).toBe("headkit:project:velodrome");
    expect(tagCoveringPath("/projects", ["headkit:projects"])).toBe(
      "headkit:projects",
    );
    expect(tagCoveringPath("/projects", ["headkit:page:projects"])).toBe(
      "headkit:page:projects",
    );
  });

  it("covers a CMS page path by its page tag, nested URI included", () => {
    // `page_` carries `get_page_uri($post)`, so a child page's path and its tag
    // hold the identical multi-segment string.
    expect(tagCoveringPath("/size-guide", ["headkit:page:size-guide"])).toBe(
      "headkit:page:size-guide",
    );
    expect(
      tagCoveringPath("/support/returns", ["headkit:page:support/returns"]),
    ).toBe("headkit:page:support/returns");
  });

  it("covers the two landing slugs the theme swaps for a ROUTE tag", () => {
    // `page_sale` / `page_new-in` emit the path but a route tag, not a page
    // tag — and the storefront's `/sale` and `/new-in` read the catalogue at
    // `{ kind: "route" }`, so the route tag is what is on them.
    expect(tagCoveringPath("/sale", ["headkit:route:sale"])).toBe(
      "headkit:route:sale",
    );
    expect(tagCoveringPath("/new-in", ["headkit:route:new"])).toBe(
      "headkit:route:new",
    );
    // …and a page tag for the same slug is NOT cover, because the theme never
    // sends that pair and the page tag is not on those route entries.
    expect(tagCoveringPath("/sale", ["headkit:page:sale"])).toBeNull();
  });

  it("returns null when the payload names no covering tag", () => {
    expect(
      tagCoveringPath("/collections/helmets", [
        "headkit:product:some-other-thing",
        "headkit:products",
      ]),
    ).toBeNull();
    expect(tagCoveringPath("/products/a-shoe", [])).toBeNull();
  });

  it("never treats a page tag as cover for another family's path", () => {
    // Families are decided by FIRST SEGMENT so they cannot overlap: a WordPress
    // page whose URI began `collections/` would carry a page tag that does not
    // reach the collections route.
    expect(
      tagCoveringPath("/collections/something", [
        "headkit:page:collections/something",
      ]),
    ).toBeNull();
    expect(
      tagCoveringPath("/products/x", ["headkit:page:products/x"]),
    ).toBeNull();
  });

  it("never skips the site root, which the theme deliberately stops emitting", () => {
    expect(tagCoveringPath("/", ["headkit:route:home"])).toBeNull();
    expect(tagCoveringPath("", ["headkit:route:home"])).toBeNull();
  });

  it("ignores a query string or fragment when classifying", () => {
    expect(
      tagCoveringPath("/collections/helmets?page=2", [
        "headkit:catalog:cat:helmets",
      ]),
    ).toBe("headkit:catalog:cat:helmets");
  });

  it("classifies a whole product-save payload against its own tags", () => {
    // The shape a content-only product save produces: the product entity tag,
    // one grid tag per category the product is in (ancestors included), and the
    // brand product-set tag — beside the paths built from the SAME terms. Every
    // path is covered, which is exactly why an unconditional path loop was able
    // to undo the tag loop.
    const tags = [
      "headkit:product:mountain-bike-helmet",
      "headkit:catalog:cat:helmets",
      "headkit:catalog:cat:mountain-bike-helmets",
      "headkit:brand:acme",
    ];
    const paths = [
      "/products/mountain-bike-helmet",
      "/collections/helmets",
      "/collections/helmets/mountain-bike-helmets",
    ];
    expect(paths.map((p) => tagCoveringPath(p, tags))).toEqual([
      "headkit:product:mountain-bike-helmet",
      "headkit:catalog:cat:helmets",
      "headkit:catalog:cat:mountain-bike-helmets",
    ]);
  });
});
