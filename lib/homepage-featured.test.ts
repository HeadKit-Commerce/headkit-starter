import { describe, expect, it } from "vitest";
import { shouldShowHomepageFeaturedProducts } from "@/lib/homepage-featured";

const shopifyProducts = [{ id: "gid://shopify/Product/1" }];
const wooProducts = [{ id: "1" }];

describe("shouldShowHomepageFeaturedProducts", () => {
  it("shows when featured products exist and WP has no product carousel", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: shopifyProducts,
        editorBlocks: [],
      }),
    ).toBe(true);
  });

  it("hides Woo catalog products so the CMS homepage stays as-is", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: wooProducts,
        editorBlocks: [],
      }),
    ).toBe(false);
  });

  it("hides when there are no featured products", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: [],
        editorBlocks: [],
      }),
    ).toBe(false);
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: null,
        editorBlocks: [],
      }),
    ).toBe(false);
  });

  it("skips when WP already has a product carousel class", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: shopifyProducts,
        editorBlocks: [{ cssClasses: ["headkit-product-carousel"] }],
      }),
    ).toBe(false);
  });

  it("skips when WP queryType is a product carousel", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: shopifyProducts,
        editorBlocks: [
          {
            cssClasses: [],
            attrs: { queryType: "handpicked-products" },
          },
        ],
      }),
    ).toBe(false);
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: shopifyProducts,
        editorBlocks: [
          {
            cssClasses: [],
            attrs: { queryType: "product-carousel" },
          },
        ],
      }),
    ).toBe(false);
  });

  it("still shows beside a WP on-sale carousel queryType without the class", () => {
    expect(
      shouldShowHomepageFeaturedProducts({
        featuredProducts: shopifyProducts,
        editorBlocks: [{ cssClasses: [], attrs: { queryType: "on-sale" } }],
      }),
    ).toBe(true);
  });
});
