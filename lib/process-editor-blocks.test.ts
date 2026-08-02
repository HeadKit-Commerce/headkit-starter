import { describe, expect, it } from "vitest";
import {
  processHomepageContent,
  processEditorBlocks,
  extractHeadkitSections,
  getBlockQueryType,
} from "./process-editor-blocks";

const HILIGHT_SECTION = `<div class="wp-block-group headkit-hilight headkit-block-section"><div class="wp-block-group__inner-container"><div class="wp-block-columns"><div class="wp-block-column"><h2 class="wp-block-heading headkit-block-title">About Us</h2><p class="headkit-block-description">We sell great things.</p></div><div class="wp-block-column"><div class="wp-block-buttons headkit-block-buttons"><div class="wp-block-button headkit-block-button"><a class="wp-block-button__link wp-element-button" href="/about">Learn more</a></div></div></div></div></div></div>`;

const CAROUSEL_SECTION = `<div class="wp-block-group headkit-product-carousel headkit-block-section"><div class="wp-block-group__inner-container"><h2 class="wp-block-heading headkit-block-title">SALE</h2><p class="headkit-block-description">Hot deals</p></div></div>`;

const GALLERY_SECTION = `<div class="wp-block-group headkit-gallery headkit-block-section"><figure class="wp-block-gallery columns-2"><img src="https://example.com/a.jpg" alt="A" /></figure></div>`;

const LEFTOVER_PARAGRAPH = `<p>Plain Gutenberg paragraph on the front page.</p>`;

describe("extractHeadkitSections", () => {
  it("extracts constrained and non-inner-container sections", () => {
    const html = `${HILIGHT_SECTION}${GALLERY_SECTION}`;
    const sections = extractHeadkitSections(html);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classAttr).toContain("headkit-hilight");
    expect(sections[1]?.classAttr).toContain("headkit-gallery");
    expect(sections[1]?.innerHtml).toContain("wp-block-gallery");
  });
});

describe("processHomepageContent", () => {
  it("merges products and queryType attrs by section index", () => {
    const html = `${HILIGHT_SECTION}${CAROUSEL_SECTION}${LEFTOVER_PARAGRAPH}`;
    const { blocks, leftoverHtml } = processHomepageContent(html, [
      {},
      {
        products: [{ id: "1", name: "Sale Tee" }],
        queryType: "on-sale",
        attrs: { className: "headkit-product-carousel headkit-block-section" },
      },
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.cssClasses).toContain("headkit-hilight");
    expect(blocks[0]?.title).toBe("About Us");
    expect(blocks[0]?.button?.url).toBe("/about");

    expect(blocks[1]?.cssClasses).toContain("headkit-product-carousel");
    expect(blocks[1]?.products).toHaveLength(1);
    expect(getBlockQueryType(blocks[1]!)).toBe("on-sale");
    expect(blocks[1]?.html).toContain("headkit-product-carousel");

    expect(leftoverHtml).toContain("Plain Gutenberg paragraph");
    expect(leftoverHtml).not.toContain("headkit-block-section");
  });

  it("returns empty leftover when only HeadKit sections exist", () => {
    const { leftoverHtml } = processHomepageContent(HILIGHT_SECTION, [{}]);
    expect(leftoverHtml.trim()).toBe("");
  });
});

describe("processEditorBlocks", () => {
  it("returns blocks only (back-compat)", () => {
    const blocks = processEditorBlocks(HILIGHT_SECTION, []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.section).toBe("section-1");
  });
});

describe("getBlockQueryType", () => {
  it("reads queryType from attrs", () => {
    expect(
      getBlockQueryType({
        name: "",
        cssClasses: [],
        section: "section-1",
        title: "",
        description: "",
        products: [],
        attrs: { queryType: "new" },
      }),
    ).toBe("new");
    expect(
      getBlockQueryType({
        name: "",
        cssClasses: [],
        section: "section-1",
        title: "",
        description: "",
        products: [],
        attrs: null,
      }),
    ).toBeNull();
  });
});
