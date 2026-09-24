import { describe, expect, it } from "vitest";
import { collectionCardLinkText, resolveSectionCopy } from "@/lib/section-copy";
import type { CopyTheme } from "@/lib/store-theme";

const FEATURED_FALLBACK = {
  title: "Featured Products",
  allButton: "View All",
  allButtonPath: "/featured",
} as const;

describe("resolveSectionCopy", () => {
  it("keeps starter hardcoded strings when copy is omitted", () => {
    expect(
      resolveSectionCopy(undefined, "homepageFeatured", FEATURED_FALLBACK),
    ).toEqual({
      title: "Featured Products",
      description: "",
      allButton: "View All",
      allButtonPath: "/featured",
    });
  });

  it("overlays only the fields a store set", () => {
    const copy: CopyTheme = {
      homepageFeatured: {
        title: "Crafted for {modern rituals}",
        eyebrow: "Luxury Towels",
        allButton: "Shop all",
      },
    };
    expect(
      resolveSectionCopy(copy, "homepageFeatured", FEATURED_FALLBACK),
    ).toEqual({
      title: "Crafted for {modern rituals}",
      description: "Luxury Towels",
      allButton: "Shop all",
      allButtonPath: "/featured",
    });
  });

  it("treats an empty title as omit so a heading cannot go blank", () => {
    expect(
      resolveSectionCopy(
        { homepageFeatured: { title: "   " } },
        "homepageFeatured",
        FEATURED_FALLBACK,
      ).title,
    ).toBe("Featured Products");
  });

  it("hides eyebrow and View-all when the store sets empty strings", () => {
    const resolved = resolveSectionCopy(
      {
        pdpRelated: {
          title: "Similar pieces {for consideration}",
          eyebrow: "",
          allButton: "",
        },
      },
      "pdpRelated",
      { title: "Something similar", eyebrow: "keep" },
    );
    expect(resolved).toEqual({
      title: "Similar pieces {for consideration}",
      description: "",
      allButton: "",
      allButtonPath: "",
    });
  });

  it("overlays journal copy onto the Latest News fallback", () => {
    expect(
      resolveSectionCopy(
        {
          homepageLatestNews: {
            title: "Journal",
            eyebrow: "The vibe, the lifestyle",
          },
        },
        "homepageLatestNews",
        {
          title: "Latest News",
          eyebrow: "Stories, tips, and updates from our team.",
          allButton: "View All",
          allButtonPath: "/journal",
        },
      ),
    ).toEqual({
      title: "Journal",
      description: "The vibe, the lifestyle",
      allButton: "View All",
      allButtonPath: "/journal",
    });
  });

  it("adds a View-all path on a section that had none", () => {
    expect(
      resolveSectionCopy(
        {
          pdpBundles: {
            title: "Included in {bundles}",
            eyebrow: "Packaged up",
            allButton: "Shop Bundles",
            allButtonPath: "/collections/bundles",
          },
        },
        "pdpBundles",
        { title: "Available in bundles" },
      ),
    ).toEqual({
      title: "Included in {bundles}",
      description: "Packaged up",
      allButton: "Shop Bundles",
      allButtonPath: "/collections/bundles",
    });
  });
});

describe("collectionCardLinkText", () => {
  it("returns null when omitted or blank", () => {
    expect(collectionCardLinkText(undefined)).toBeNull();
    expect(collectionCardLinkText({})).toBeNull();
    expect(collectionCardLinkText({ collectionCardLink: "  " })).toBeNull();
  });

  it("returns the trimmed card CTA", () => {
    expect(
      collectionCardLinkText({ collectionCardLink: " Discover Collection " }),
    ).toBe("Discover Collection");
  });
});
