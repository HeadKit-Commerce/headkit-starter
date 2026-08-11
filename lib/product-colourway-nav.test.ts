import { describe, expect, it } from "vitest";
import {
  attributesForColourway,
  colourSlugFromProductPath,
} from "./product-colourway-nav";

describe("colourSlugFromProductPath", () => {
  it("returns undefined on the base product path", () => {
    expect(colourSlugFromProductPath("/products/tee", "/products/tee")).toBe(
      undefined,
    );
  });

  it("extracts the colourway segment", () => {
    expect(
      colourSlugFromProductPath("/products/tee/navy", "/products/tee"),
    ).toBe("navy");
  });

  it("ignores unrelated paths", () => {
    expect(colourSlugFromProductPath("/shop", "/products/tee")).toBe(undefined);
  });
});

describe("attributesForColourway", () => {
  const variations = [
    {
      attributes: [
        { key: "pa_colour", value: "navy" },
        { key: "pa_size", value: "m" },
      ],
    },
    {
      attributes: [
        { key: "pa_colour", value: "navy" },
        { key: "pa_size", value: "l" },
      ],
    },
    {
      attributes: [
        { key: "pa_colour", value: "red" },
        { key: "pa_size", value: "m" },
      ],
    },
  ];

  it("keeps size when the colourway still has that size", () => {
    expect(
      attributesForColourway(variations, "pa_colour", "red", {
        pa_colour: "navy",
        pa_size: "m",
      }),
    ).toEqual({ pa_colour: "red", pa_size: "m" });
  });

  it("cascades when size is unavailable on the new colourway", () => {
    expect(
      attributesForColourway(variations, "pa_colour", "red", {
        pa_colour: "navy",
        pa_size: "l",
      }),
    ).toEqual({ pa_colour: "red", pa_size: "m" });
  });
});
