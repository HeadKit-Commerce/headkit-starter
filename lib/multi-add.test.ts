import { describe, expect, it } from "vitest";
import {
  resolveCompanionLineId,
  resolvePinAttributeSlug,
  resolvePinValue,
  type MultiAddCompanion,
} from "./multi-add";

const emptyImage = { src: "", alt: "", width: 0, height: 0 };

const companion = (
  overrides: Partial<MultiAddCompanion> = {},
): MultiAddCompanion => ({
  id: "gid://shopify/Product/1",
  name: "Companion Tee",
  slug: "companion-tee",
  type: "VARIABLE",
  price: "40.00",
  regularPrice: "40.00",
  salePrice: "",
  onSale: false,
  stockStatus: "IN_STOCK",
  attributes: [
    {
      name: "Colour",
      slug: "color",
      variation: true,
    },
  ],
  defaultAttributes: [{ key: "color", value: "black" }],
  variations: [
    {
      id: "gid://shopify/ProductVariant/10",
      sku: "BLK",
      price: "40.00",
      regularPrice: "40.00",
      salePrice: "",
      onSale: false,
      stockStatus: "instock",
      stockQuantity: 5,
      dateModified: "",
      image: emptyImage,
      images: [],
      attributes: [{ key: "color", value: "black" }],
    },
    {
      id: "gid://shopify/ProductVariant/11",
      sku: "WHT",
      price: "42.00",
      regularPrice: "42.00",
      salePrice: "",
      onSale: false,
      stockStatus: "instock",
      stockQuantity: 3,
      dateModified: "",
      image: emptyImage,
      images: [],
      attributes: [{ key: "color", value: "white" }],
    },
  ],
  ...overrides,
});

describe("resolvePinAttributeSlug", () => {
  it("defaults Colour/Color to the colour attribute", () => {
    expect(resolvePinAttributeSlug(companion().attributes, null)).toBe("color");
    expect(resolvePinAttributeSlug(companion().attributes, "Colour")).toBe(
      "color",
    );
  });
});

describe("resolvePinValue", () => {
  it("prefers selected attributes over defaults", () => {
    expect(
      resolvePinValue("color", { color: "white" }, [
        { key: "color", value: "black" },
      ]),
    ).toBe("white");
  });
});

describe("resolveCompanionLineId", () => {
  it("matches the pinned colour variation", () => {
    const line = resolveCompanionLineId(companion(), "color", "white");
    expect(line?.id).toBe("gid://shopify/ProductVariant/11");
    expect(line?.unitPrice).toBe(42);
  });

  it("returns null when the pin colour is out of stock", () => {
    const out = companion({
      variations: [
        {
          id: "gid://shopify/ProductVariant/11",
          sku: "WHT",
          price: "42.00",
          regularPrice: "42.00",
          salePrice: "",
          onSale: false,
          stockStatus: "outofstock",
          stockQuantity: 0,
          dateModified: "",
          image: emptyImage,
          images: [],
          attributes: [{ key: "color", value: "white" }],
        },
      ],
    });
    expect(resolveCompanionLineId(out, "color", "white")).toBeNull();
  });

  it("uses the product id for simple companions", () => {
    const simple = companion({
      id: "gid://shopify/Product/9",
      type: "SIMPLE",
      variations: [],
      price: "15.00",
    });
    expect(resolveCompanionLineId(simple, "color", "white")).toEqual({
      id: "gid://shopify/Product/9",
      unitPrice: 15,
    });
  });
});
