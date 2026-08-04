import { describe, expect, it } from "vitest";

import {
  bridgeTags,
  isKnownTag,
  KNOWN_MENU_LOCATIONS,
  TAG,
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
    name: "carousel → route:home",
    raw: "headkit:carousel",
    expected: ["headkit:route:home"],
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
    // carousel and page:/ both expand to route:home — it appears once.
    expect(bridgeTags(["headkit:carousel", "headkit:page:/"])).toEqual([
      "headkit:route:home",
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

  it("headkit:carousel bridges to route:home", () => {
    expect(bridgeTags(["headkit:carousel"])).toEqual([TAG.route("home")]);
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
