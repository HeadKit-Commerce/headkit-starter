import { describe, it, expect } from "vitest";
import { buildEnquiryInitialValues } from "./enquiry-form-values";

const colourAttr = {
  slug: "pa_colour",
  name: "Colour",
  fullOptions: [
    { slug: "red", name: "Red" },
    { slug: "blue", name: "Blue" },
  ],
};

const sizeAttr = {
  slug: "pa_size",
  name: "Size",
  fullOptions: [
    { slug: "m", name: "M" },
    { slug: "l", name: "L" },
  ],
};

const finishAttr = {
  slug: "pa_finish",
  name: "Finish",
  fullOptions: [
    { slug: "matte", name: "Matte" },
    { slug: "gloss", name: "Gloss" },
  ],
};

describe("buildEnquiryInitialValues", () => {
  it("always includes product_name and optional product_url", () => {
    expect(
      buildEnquiryInitialValues({
        productName: "Trail Bike",
        productUrl: "https://shop.test/p/trail",
        variationAttributes: [],
        selectedAttributes: {},
      }),
    ).toEqual([
      { fieldName: "product_name", value: "Trail Bike" },
      { fieldName: "product_url", value: "https://shop.test/p/trail" },
    ]);
  });

  it("maps colour/size to product_* and short aliases so GF Size/Colour labels hide", () => {
    const values = buildEnquiryInitialValues({
      productName: "Shirt",
      variationAttributes: [colourAttr, sizeAttr],
      selectedAttributes: { pa_colour: "red", pa_size: "m" },
    });
    const byName = Object.fromEntries(values.map((v) => [v.fieldName, v.value]));
    expect(byName.product_colour).toBe("Red");
    expect(byName.colour).toBe("Red");
    expect(byName.product_size).toBe("M");
    expect(byName.size).toBe("M");
    expect(byName.product_options).toBe("Colour: Red; Size: M");
  });

  it("captures non-colour/size attributes via name, slug, and product_options", () => {
    const values = buildEnquiryInitialValues({
      productName: "Lamp",
      variationAttributes: [finishAttr],
      selectedAttributes: { pa_finish: "matte" },
    });
    const byName = Object.fromEntries(values.map((v) => [v.fieldName, v.value]));
    expect(byName.finish).toBe("Matte");
    expect(byName.product_options).toBe("Finish: Matte");
    expect(byName.selected_variations).toBe("Finish: Matte");
    expect(byName.product_colour).toBeUndefined();
    expect(byName.product_size).toBeUndefined();
  });

  it("skips attributes with no selection", () => {
    const values = buildEnquiryInitialValues({
      productName: "Shirt",
      variationAttributes: [colourAttr, sizeAttr],
      selectedAttributes: { pa_colour: "blue" },
    });
    const byName = Object.fromEntries(values.map((v) => [v.fieldName, v.value]));
    expect(byName.product_colour).toBe("Blue");
    expect(byName.product_size).toBeUndefined();
    expect(byName.product_options).toBe("Colour: Blue");
  });
});
