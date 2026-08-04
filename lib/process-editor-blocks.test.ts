import { describe, expect, it } from "vitest";
import {
  processHomepageContent,
  processEditorBlocks,
  extractHeadkitSections,
  getBlockQueryType,
  hasEditorSectionClass,
} from "./process-editor-blocks";

const HILIGHT_SECTION = `<div class="wp-block-group headkit-hilight headkit-block-section"><div class="wp-block-group__inner-container"><div class="wp-block-columns"><div class="wp-block-column"><h2 class="wp-block-heading headkit-block-title">About Us</h2><p class="headkit-block-description">We sell great things.</p></div><div class="wp-block-column"><div class="wp-block-buttons headkit-block-buttons"><div class="wp-block-button headkit-block-button"><a class="wp-block-button__link wp-element-button" href="/about">Learn more</a></div></div></div></div></div></div>`;

const CAROUSEL_SECTION = `<div class="wp-block-group headkit-product-carousel headkit-block-section section-2"><div class="wp-block-group__inner-container"><h2 class="wp-block-heading headkit-block-title">SALE</h2><p class="headkit-block-description">Hot deals</p></div></div>`;

const GALLERY_SECTION = `<div class="wp-block-group headkit-gallery headkit-block-section"><figure class="wp-block-gallery columns-2"><img src="https://example.com/a.jpg" alt="A" /></figure></div>`;

const LEFTOVER_PARAGRAPH = `<p>Plain Gutenberg paragraph on the front page.</p>`;

const EARLY_COPY = `<p>Welcome copy before any HeadKit section.</p>`;

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
    const { blocks, leftoverHtml, segments } = processHomepageContent(html, [
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

    expect(segments.map((s) => s.kind)).toEqual(["block", "block", "html"]);
  });

  it("preserves document order when leftover precedes HeadKit sections", () => {
    const html = `${EARLY_COPY}${HILIGHT_SECTION}${CAROUSEL_SECTION}`;
    const { segments } = processHomepageContent(html, [{}, {}]);

    expect(segments).toHaveLength(3);
    expect(segments[0]?.kind).toBe("html");
    if (segments[0]?.kind === "html") {
      expect(segments[0].html).toContain("Welcome copy");
    }
    expect(segments[1]?.kind).toBe("block");
    if (segments[1]?.kind === "block") {
      expect(segments[1].block.cssClasses).toContain("headkit-hilight");
    }
    expect(segments[2]?.kind).toBe("block");
    if (segments[2]?.kind === "block") {
      expect(segments[2].block.section).toBe("section-2");
      expect(segments[2].block.cssClasses).toContain(
        "headkit-product-carousel",
      );
    }
  });

  it("interleaves leftover between sections in document order", () => {
    const mid = `<p>Middle copy between sections.</p>`;
    const html = `${HILIGHT_SECTION}${mid}${CAROUSEL_SECTION}`;
    const { segments } = processHomepageContent(html, [{}, {}]);

    expect(segments.map((s) => s.kind)).toEqual(["block", "html", "block"]);
    if (segments[1]?.kind === "html") {
      expect(segments[1].html).toContain("Middle copy");
    }
  });

  it("returns empty leftover when only HeadKit sections exist", () => {
    const { leftoverHtml, segments } = processHomepageContent(HILIGHT_SECTION, [
      {},
    ]);
    expect(leftoverHtml.trim()).toBe("");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("block");
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

describe("hasEditorSectionClass", () => {
  it("detects HeadKit section classes used to skip hardcoded modules", () => {
    expect(
      hasEditorSectionClass(
        [
          {
            cssClasses: ["headkit-category-carousel", "headkit-block-section"],
          },
        ],
        "headkit-category-carousel",
      ),
    ).toBe(true);
    expect(
      hasEditorSectionClass(
        [{ cssClasses: ["headkit-product-carousel"] }],
        "headkit-brand-carousel",
      ),
    ).toBe(false);
  });
});

describe("category / brand / post hydration from attrs", () => {
  it("merges categories, brands, and posts onto processed blocks", () => {
    const CAT_SECTION = `<div class="wp-block-group headkit-category-carousel headkit-block-section"><div class="wp-block-group__inner-container"><h2 class="wp-block-heading headkit-block-title">Shop by Category</h2></div></div>`;
    const BRAND_SECTION = `<div class="wp-block-group headkit-brand-carousel headkit-block-section"><div class="wp-block-group__inner-container"><h2 class="wp-block-heading headkit-block-title">Our Brands</h2></div></div>`;
    const POST_SECTION = `<div class="wp-block-group headkit-post-carousel headkit-block-section"><div class="wp-block-group__inner-container"><h2 class="wp-block-heading headkit-block-title">Latest News</h2></div></div>`;

    const { blocks } = processHomepageContent(
      `${CAT_SECTION}${BRAND_SECTION}${POST_SECTION}`,
      [
        {
          queryType: "featured-categories",
          attrs: {
            queryType: "featured-categories",
            categories: [
              {
                name: "Shoes",
                slug: "shoes",
                uri: "/shop/shoes",
                thumbnail: "https://example.com/shoes.jpg",
              },
            ],
          },
        },
        {
          queryType: "featured-brands",
          attrs: {
            queryType: "featured-brands",
            brands: [
              {
                name: "Acme",
                slug: "acme",
                thumbnail: "https://example.com/acme.png",
              },
            ],
          },
        },
        {
          queryType: "latest-posts",
          attrs: {
            queryType: "latest-posts",
            posts: [
              {
                id: 9,
                title: "Hello",
                slug: "hello",
                uri: "/news/hello",
                featuredImage: { src: "https://example.com/p.jpg", alt: "H" },
              },
            ],
          },
        },
      ],
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.categories?.[0]?.slug).toBe("shoes");
    expect(getBlockQueryType(blocks[0]!)).toBe("featured-categories");
    expect(blocks[1]?.brands?.[0]?.name).toBe("Acme");
    expect(blocks[2]?.posts?.[0]?.slug).toBe("hello");
    expect(blocks[2]?.posts?.[0]?.featuredImage?.src).toContain("p.jpg");
  });
});
