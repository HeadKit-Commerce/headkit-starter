import { describe, expect, it } from "vitest";
import { expandCatalogProducts } from "@/lib/catalog-display";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

function makeProduct(
  overrides: Partial<ProductSummaryFieldsFragment> &
    Pick<ProductSummaryFieldsFragment, "id" | "slug" | "name">,
): ProductSummaryFieldsFragment {
  return {
    uri: `/products/${overrides.slug}`,
    type: "VARIABLE",
    price: "10",
    regularPrice: "10",
    salePrice: "",
    onSale: false,
    isNew: false,
    stockStatus: "IN_STOCK",
    image: { src: "/main.jpg", alt: "", width: 0, height: 0 },
    hoverImage: { src: "/hover.jpg", alt: "", width: 0, height: 0 },
    attributes: [],
    variations: [],
    ...overrides,
  };
}

describe("expandCatalogProducts", () => {
  it("returns one card per product when showVariants is false", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [
          {
            id: "pa_colour",
            name: "Colour",
            slug: "pa_colour",
            type: "color",
            options: ["red", "blue"],
            visible: true,
            variation: true,
            fullOptions: [
              {
                name: "Red",
                slug: "red",
                swatchColor: "#f00",
                swatchColor2: "",
              },
              {
                name: "Blue",
                slug: "blue",
                swatchColor: "#00f",
                swatchColor2: "",
              },
            ],
          },
        ],
      }),
    ];

    const result = expandCatalogProducts(products, false);
    expect(result).toHaveLength(1);
    expect(result[0]?.colorwaySlug).toBeNull();
  });

  it("expands colourways when showVariants is true", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [
          {
            id: "pa_colour",
            name: "Colour",
            slug: "pa_colour",
            type: "color",
            options: ["red", "blue"],
            visible: true,
            variation: true,
            fullOptions: [
              {
                name: "Red",
                slug: "red",
                swatchColor: "#f00",
                swatchColor2: "",
              },
              {
                name: "Blue",
                slug: "blue",
                swatchColor: "#00f",
                swatchColor2: "",
              },
            ],
          },
        ],
        variations: [
          {
            id: "v1",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            image: { src: "/red.jpg" },
            images: [{ src: "/red.jpg" }, { src: "/red-hover.jpg" }],
            attributes: [{ key: "pa_colour", value: "red" }],
          },
          {
            id: "v2",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            image: { src: "/blue.jpg" },
            images: [{ src: "/blue.jpg" }],
            attributes: [{ key: "pa_colour", value: "blue" }],
          },
        ],
      }),
    ];

    const result = expandCatalogProducts(products, true);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.colorwaySlug)).toEqual(["red", "blue"]);
    expect(result[0]?.image?.src).toBe("/red.jpg");
    expect(result[1]?.image?.src).toBe("/blue.jpg");
    // Red has a second variation gallery image → colourway-specific rollover.
    expect(result[0]?.hoverImage?.src).toBe("/red-hover.jpg");
    // Blue has no second image → fall back to parent hoverImage.
    expect(result[1]?.hoverImage?.src).toBe("/hover.jpg");
  });

  it("does not expand size-only attributes", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [
          {
            id: "pa_size",
            name: "Size",
            slug: "pa_size",
            type: "select",
            options: ["s", "m"],
            visible: true,
            variation: true,
            fullOptions: [
              { name: "S", slug: "s", swatchColor: "", swatchColor2: "" },
              { name: "M", slug: "m", swatchColor: "", swatchColor2: "" },
            ],
          },
        ],
      }),
    ];

    const result = expandCatalogProducts(products, true);
    expect(result).toHaveLength(1);
    expect(result[0]?.colorwaySlug).toBeNull();
  });
});
