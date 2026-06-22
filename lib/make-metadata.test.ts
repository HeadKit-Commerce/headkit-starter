import { describe, expect, it } from "vitest";
import { makeSeoMetadata, seoFallbackDescription } from "./make-metadata";

/**
 * make-metadata fallback coverage — FE-09 precursor (plan 03-06).
 *
 * Phase-2 lesson: SEO fallback gaps appear only when Yoast/SEO data is absent.
 * These tests pin the templated-fallback contract BEFORE FE-09 wires it.
 *
 * Test 1 (templated fallback) is expected RED until plan 03-06 (FE-09)
 * implements the per-entity templated SEO defaults. It documents the contract
 * the implementer must satisfy. Today `makeSeoMetadata` returns the BARE
 * fallback title ("Widgets"), not the templated form ("Widgets | HeadKit").
 *
 * Test 2 (seo wins) reflects current behavior and should be GREEN.
 */
describe("makeSeoMetadata fallback chain (FE-09)", () => {
  it("RED (FE-09 / plan 03-06): when Yoast/seo is absent, returns the TEMPLATED fallback title + description", () => {
    const meta = makeSeoMetadata(null, {
      title: "Widgets",
      description: "All our widgets",
    });

    // Contract FE-09 must satisfy: the fallback is templated with the site
    // name (not the bare entity title). Until plan 03-06 wires the template,
    // this assertion is RED — that is intentional.
    expect(meta.title).toBe("Widgets | HeadKit");
    // Description must be the non-empty fallback, never undefined/empty.
    expect(meta.description).toBe("All our widgets");
  });

  it("when seo.title is present, the SEO title wins over the fallback", () => {
    const meta = makeSeoMetadata(
      {
        title: "Premium Widgets",
        metaDesc: "Our finest widgets",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Widgets", description: "All our widgets" },
    );

    expect(meta.title).toBe("Premium Widgets");
    expect(meta.description).toBe("Our finest widgets");
  });
});

describe("seoFallbackDescription per-entity templates (FE-09 / D-04)", () => {
  it("returns distinct, non-empty defaults for product / category / page", () => {
    const product = seoFallbackDescription("product", "Widgets");
    const category = seoFallbackDescription("category", "Widgets");
    const page = seoFallbackDescription("page", "About Us");

    expect(product).not.toBe("");
    expect(category).not.toBe("");
    expect(page).not.toBe("");

    // Each entity type produces a distinct template.
    expect(new Set([product, category, page]).size).toBe(3);

    // Each default mentions the entity name.
    expect(product).toContain("Widgets");
    expect(category).toContain("Widgets");
    expect(page).toContain("About Us");
  });

  it("falls back to the site name when the entity name is empty", () => {
    const desc = seoFallbackDescription("product", "");
    expect(desc).not.toBe("");
    expect(desc).toContain("HeadKit");
  });
});
