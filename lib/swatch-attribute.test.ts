import { describe, expect, it } from "vitest";
import { findSwatchAttribute, isSwatchAttribute } from "./swatch-attribute";

describe("isSwatchAttribute", () => {
  it("treats WooCommerce color/swatch types as swatches", () => {
    expect(isSwatchAttribute({ slug: "pa_finish", type: "color" })).toBe(true);
    expect(isSwatchAttribute({ slug: "pa_finish", type: "Colour" })).toBe(true);
    expect(isSwatchAttribute({ slug: "pa_finish", type: "swatch" })).toBe(true);
    expect(isSwatchAttribute({ slug: "pa_finish", type: "wc-visual" })).toBe(
      true,
    );
  });

  it("does not treat plain select attributes as swatches", () => {
    expect(isSwatchAttribute({ slug: "pa_size", type: "select" })).toBe(false);
    expect(isSwatchAttribute({ slug: "pa_size", type: "" })).toBe(false);
  });

  it("keeps legacy pa_color / pa_colour slug detection", () => {
    expect(isSwatchAttribute({ slug: "pa_color", type: "select" })).toBe(true);
    expect(isSwatchAttribute({ slug: "pa_colour", type: "select" })).toBe(true);
  });

  it("treats Shopify color / colour slugs as swatches", () => {
    expect(isSwatchAttribute({ slug: "color", type: "select" })).toBe(true);
    expect(isSwatchAttribute({ slug: "colour", type: "select" })).toBe(true);
  });

  it("treats 1-product bundle option slugs as swatches", () => {
    expect(
      isSwatchAttribute({
        slug: "monogram-bath-towel-colour",
        type: "select",
      }),
    ).toBe(true);
    expect(
      isSwatchAttribute({ slug: "monogram-bath-sheet-colour", type: "" }),
    ).toBe(true);
  });

  it("falls back to term swatch colours when type is missing", () => {
    expect(
      isSwatchAttribute({
        slug: "pa_finish",
        type: "select",
        fullOptions: [{ swatchColor: "#112233" }],
      }),
    ).toBe(true);
    expect(
      isSwatchAttribute({
        slug: "pa_finish",
        type: "select",
        fullOptions: [{ swatchColor: "" }],
      }),
    ).toBe(false);
  });

  it("treats a swatch image as a visual swatch even without hex", () => {
    expect(
      isSwatchAttribute({
        slug: "pa_finish",
        type: "select",
        fullOptions: [
          { swatchImage: "https://cdn.shopify.com/s/files/red.png" },
        ],
      }),
    ).toBe(true);
  });
});

describe("findSwatchAttribute", () => {
  it("returns the first swatch-typed attribute", () => {
    const attrs = [
      { slug: "pa_size", type: "select" },
      { slug: "pa_finish", type: "color" },
      { slug: "pa_color", type: "select" },
    ];
    expect(findSwatchAttribute(attrs)?.slug).toBe("pa_finish");
  });
});
