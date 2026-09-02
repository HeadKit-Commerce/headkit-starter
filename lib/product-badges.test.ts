import { describe, expect, it } from "vitest";
import { isBadgeTag, productBadgesFromTags } from "./product-badges";

describe("isBadgeTag", () => {
  it("treats badge: prefix as a badge regardless of allowlist", () => {
    expect(isBadgeTag({ name: "badge:NEW", slug: "badge-new" })).toBe(true);
    expect(isBadgeTag({ name: "Limited", slug: "limited" })).toBe(false);
  });

  it("matches allowlist by name or slug, case-insensitive", () => {
    expect(
      isBadgeTag({ name: "Limited", slug: "limited" }, ["limited"]),
    ).toBe(true);
    expect(isBadgeTag({ name: "NEW", slug: "new" }, ["New"])).toBe(true);
    expect(isBadgeTag({ name: "Organic", slug: "organic" }, ["limited"])).toBe(
      false,
    );
  });
});

describe("productBadgesFromTags", () => {
  const tags = [
    { name: "badge:NEW", slug: "badge-new" },
    { name: "Limited", slug: "limited" },
    { name: "organic", slug: "organic" },
    { name: "Sale", slug: "sale" },
  ];

  it("always includes badge: labels and allowlisted tags", () => {
    expect(productBadgesFromTags(tags, ["limited"])).toEqual([
      { label: "NEW", slug: "badge-new" },
      { label: "Limited", slug: "limited" },
    ]);
  });

  it("hides New/Sale when those flags already render", () => {
    expect(
      productBadgesFromTags(tags, ["sale"], { hideNew: true, hideSale: true }),
    ).toEqual([{ label: "NEW", slug: "badge-new" }]);
    expect(
      productBadgesFromTags([{ name: "badge:NEW", slug: "badge-new" }], [], {
        hideNew: true,
      }),
    ).toEqual([]);
  });

  it("dedupes by lowercase label", () => {
    expect(
      productBadgesFromTags(
        [
          { name: "badge:NEW", slug: "badge-new" },
          { name: "NEW", slug: "new" },
        ],
        ["new"],
      ),
    ).toEqual([{ label: "NEW", slug: "badge-new" }]);
  });
});
