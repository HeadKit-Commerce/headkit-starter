import { describe, expect, it } from "vitest";
import {
  applyVisualSwatches,
  attributeIdsNeedingVisuals,
  commerceOriginFromImageSrc,
  imageUrlFromVisual,
  storeApiAttributeTermsUrl,
  visualImageBySlug,
} from "./swatch-image";

const BLACK_RATTAN =
  "https://commerce.paralelfurniture.com.au/wp-content/uploads/2026/08/Black-Rattan-150x150.png";
const WALNUT_RATTAN =
  "https://commerce.paralelfurniture.com.au/wp-content/uploads/2026/08/Walnut-Rattan-150x150.png";

/** Shape returned by the Store API with `__experimental_visual=true`. */
const baseFinishTerms = [
  {
    id: 292,
    name: "Black",
    slug: "black",
    __experimentalVisual: { type: "color", value: "#000000" },
  },
  {
    id: 382,
    name: "Black Rattan",
    slug: "black-rattan",
    __experimentalVisual: { type: "image", value: BLACK_RATTAN },
  },
  {
    id: 383,
    name: "Walnut Rattan",
    slug: "walnut-rattan",
    __experimentalVisual: { type: "image", value: WALNUT_RATTAN },
  },
  {
    id: 301,
    name: "Standard",
    slug: "standard",
    __experimentalVisual: { type: "none", value: "" },
  },
  { id: 339, name: "Menta", slug: "menta" },
];

describe("imageUrlFromVisual", () => {
  it("reads an image URL from __experimentalVisual", () => {
    expect(imageUrlFromVisual({ type: "image", value: BLACK_RATTAN })).toBe(
      BLACK_RATTAN,
    );
  });

  it("ignores colour hex and empty visuals", () => {
    expect(imageUrlFromVisual({ type: "color", value: "#b2ce92" })).toBe("");
    expect(imageUrlFromVisual({ type: "none", value: "" })).toBe("");
    expect(imageUrlFromVisual({ type: "image", value: "not a url" })).toBe("");
    expect(imageUrlFromVisual(undefined)).toBe("");
  });
});

describe("visualImageBySlug", () => {
  it("keeps only terms WooCommerce marked as images", () => {
    const images = visualImageBySlug(baseFinishTerms);
    expect(images.get("black-rattan")).toBe(BLACK_RATTAN);
    expect(images.get("walnut-rattan")).toBe(WALNUT_RATTAN);
    expect(images.has("black")).toBe(false);
    expect(images.has("standard")).toBe(false);
    expect(images.has("menta")).toBe(false);
  });
});

describe("storeApiAttributeTermsUrl", () => {
  it("calls the Store API attribute terms route with the visual flag", () => {
    expect(storeApiAttributeTermsUrl("https://commerce.example", "16", 2)).toBe(
      "https://commerce.example/wp-json/wc/store/v1/products/attributes/16/terms?__experimental_visual=true&per_page=100&hide_empty=false&page=2",
    );
  });

  it("refuses a non-numeric attribute id", () => {
    expect(() =>
      storeApiAttributeTermsUrl("https://commerce.example", "pa_finish"),
    ).toThrow(/numeric/);
  });
});

describe("applyVisualSwatches", () => {
  const product = {
    image: {
      src: "https://commerce.paralelfurniture.com.au/wp-content/uploads/2026/08/chair.jpg",
    },
    attributes: [
      {
        id: "16",
        slug: "pa_base-finish",
        type: "wc-visual",
        fullOptions: [
          { slug: "black", swatchColor: "#000000", swatchImage: null },
          { slug: "black-rattan", swatchColor: "", swatchImage: null },
          { slug: "walnut-rattan", swatchColor: "", swatchImage: "" },
        ],
      },
      {
        id: "9",
        slug: "pa_finish",
        type: "wc-visual",
        fullOptions: [
          { slug: "menta", swatchColor: "#b2ce92", swatchImage: null },
        ],
      },
    ],
  };

  it("joins image terms by attribute id and slug", () => {
    const images = new Map([
      ["16", visualImageBySlug(baseFinishTerms)],
      [
        "9",
        visualImageBySlug([
          {
            slug: "menta",
            __experimentalVisual: { type: "color", value: "#b2ce92" },
          },
        ]),
      ],
    ]);
    const filled = applyVisualSwatches(product, images);
    const base = filled.attributes?.[0]?.fullOptions;
    expect(base?.[0]?.swatchImage).toBeNull();
    expect(base?.[1]?.swatchImage).toBe(BLACK_RATTAN);
    expect(base?.[2]?.swatchImage).toBe(WALNUT_RATTAN);
    expect(filled.attributes?.[1]?.fullOptions?.[0]?.swatchImage).toBeNull();
  });

  it("does not replace a swatch image the product API already sent", () => {
    const images = new Map([["16", visualImageBySlug(baseFinishTerms)]]);
    const filled = applyVisualSwatches(
      {
        attributes: [
          {
            id: "16",
            slug: "pa_base-finish",
            type: "wc-visual",
            fullOptions: [
              {
                slug: "black-rattan",
                swatchImage: "https://cdn.example/already.png",
              },
            ],
          },
        ],
      },
      images,
    );
    expect(filled.attributes?.[0]?.fullOptions?.[0]?.swatchImage).toBe(
      "https://cdn.example/already.png",
    );
  });

  it("does not apply a term image onto a different attribute that shares the slug", () => {
    const images = new Map([["16", visualImageBySlug(baseFinishTerms)]]);
    const filled = applyVisualSwatches(
      {
        attributes: [
          {
            id: "9",
            slug: "pa_finish",
            type: "wc-visual",
            fullOptions: [{ slug: "black-rattan", swatchImage: null }],
          },
        ],
      },
      images,
    );
    expect(filled.attributes?.[0]?.fullOptions?.[0]?.swatchImage).toBeNull();
  });
});

describe("attributeIdsNeedingVisuals", () => {
  it("includes a visual attribute that still has an empty image", () => {
    expect(
      attributeIdsNeedingVisuals({
        attributes: [
          {
            id: "16",
            slug: "pa_base-finish",
            type: "wc-visual",
            fullOptions: [{ slug: "black-rattan", swatchImage: null }],
          },
          {
            id: "10",
            slug: "pa_fabric",
            type: "select",
            fullOptions: [{ slug: "linen", swatchImage: null }],
          },
        ],
      }),
    ).toEqual(["16"]);
  });
});

describe("commerceOriginFromImageSrc", () => {
  it("uses the WordPress host from a product image", () => {
    expect(
      commerceOriginFromImageSrc(
        "https://commerce.paralelfurniture.com.au/wp-content/uploads/2026/08/chair.jpg",
      ),
    ).toBe("https://commerce.paralelfurniture.com.au");
  });

  it("ignores non-WordPress hosts", () => {
    expect(
      commerceOriginFromImageSrc(
        "https://storage.googleapis.com/headkit-storage/branding/logo.svg",
      ),
    ).toBeNull();
  });
});
