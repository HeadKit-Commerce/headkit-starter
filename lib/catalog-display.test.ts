import { describe, expect, it } from "vitest";
import {
  collapseCatalogProducts,
  expandCatalogProducts,
  resolveCarouselColourway,
} from "@/lib/catalog-display";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

type TestProduct = ProductSummaryFieldsFragment & {
  defaultAttributes?: Array<{ key: string; value: string }>;
  variations: Array<
    ProductSummaryFieldsFragment["variations"][number] & {
      dateModified?: string | null;
    }
  >;
};

function makeProduct(
  overrides: Partial<TestProduct> &
    Pick<ProductSummaryFieldsFragment, "id" | "slug" | "name">,
): TestProduct {
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
    defaultAttributes: [],
    ...overrides,
  };
}

const colourAttr = {
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
};

describe("expandCatalogProducts", () => {
  it("collapses to one default/first colourway when showVariants is false", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [colourAttr],
        defaultAttributes: [{ key: "pa_colour", value: "blue" }],
        variations: [
          {
            id: "v1",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            image: { src: "/red.jpg" },
            images: [{ src: "/red.jpg" }],
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

    const result = expandCatalogProducts(products, false);
    expect(result).toHaveLength(1);
    expect(result[0]?.colorwaySlug).toBe("blue");
    expect(result[0]?.image?.src).toBe("/blue.jpg");
  });

  it("expands colourways when showVariants is true", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [colourAttr],
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

describe("collapseCatalogProducts", () => {
  it("prefers admin pin over WooCommerce default", () => {
    const products = [
      makeProduct({
        id: "42",
        slug: "tee",
        name: "Tee",
        attributes: [colourAttr],
        defaultAttributes: [{ key: "pa_colour", value: "red" }],
        variations: [
          {
            id: "v1",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            image: { src: "/red.jpg" },
            images: [{ src: "/red.jpg" }],
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

    const result = collapseCatalogProducts(products, { "42": "blue" });
    expect(result).toHaveLength(1);
    expect(result[0]?.colorwaySlug).toBe("blue");
    expect(result[0]?.image?.src).toBe("/blue.jpg");
  });

  it("uses latest updated variation colour when no default", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        attributes: [colourAttr],
        variations: [
          {
            id: "v1",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            dateModified: "2024-01-01T00:00:00Z",
            image: { src: "/red.jpg" },
            images: [{ src: "/red.jpg" }],
            attributes: [{ key: "pa_colour", value: "red" }],
          },
          {
            id: "v2",
            price: "10",
            regularPrice: "10",
            salePrice: "",
            onSale: false,
            stockStatus: "IN_STOCK",
            dateModified: "2025-06-01T00:00:00Z",
            image: { src: "/blue.jpg" },
            images: [{ src: "/blue.jpg" }],
            attributes: [{ key: "pa_colour", value: "blue" }],
          },
        ],
      }),
    ];

    expect(resolveCarouselColourway(products[0]!)).toBe("blue");
    const result = collapseCatalogProducts(products);
    expect(result[0]?.colorwaySlug).toBe("blue");
  });

  it("sets onSale from the shown colourway variation", () => {
    const products = [
      makeProduct({
        id: "1",
        slug: "tee",
        name: "Tee",
        onSale: true, // parent true because another colourway is on sale
        attributes: [colourAttr],
        defaultAttributes: [{ key: "pa_colour", value: "red" }],
        variations: [
          {
            id: "v1",
            price: "8",
            regularPrice: "10",
            salePrice: "8",
            onSale: true,
            stockStatus: "IN_STOCK",
            image: { src: "/red.jpg" },
            images: [{ src: "/red.jpg" }],
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

    const red = collapseCatalogProducts(products);
    expect(red[0]?.onSale).toBe(true);

    const blueOnly = collapseCatalogProducts(products, { "1": "blue" });
    expect(blueOnly[0]?.onSale).toBe(false);
  });
});
