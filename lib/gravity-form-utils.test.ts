import { describe, it, expect } from "vitest";
import {
  snakeCase,
  buildFieldIdByName,
  buildFieldValues,
} from "./gravity-form-utils";

describe("snakeCase", () => {
  it("lowercases, replaces whitespace, strips punctuation", () => {
    expect(snakeCase("First Name")).toBe("first_name");
    expect(snakeCase("Product URL")).toBe("product_url");
    expect(snakeCase("Product Colour")).toBe("product_colour");
    expect(snakeCase("E-mail Address!")).toBe("email_address");
  });
});

describe("buildFieldIdByName", () => {
  it("maps every field's snakeCased label to its databaseId, including hidden fields", () => {
    const nodes = [
      { databaseId: 1, label: "Name" },
      { databaseId: 2, label: "Email" },
      { databaseId: 3, label: "Message" },
      // hidden product-enquiry fields — never rendered, but must still map:
      { databaseId: 4, label: "Product Name" },
      { databaseId: 5, label: "Product URL" },
      { databaseId: 6, label: "Product Size" },
      { databaseId: 7, label: "Product Colour" },
    ];
    expect(buildFieldIdByName(nodes)).toEqual({
      name: 1,
      email: 2,
      message: 3,
      product_name: 4,
      product_url: 5,
      product_size: 6,
      product_colour: 7,
    });
  });

  it("skips nodes with a missing label and tolerates null/undefined input", () => {
    expect(
      buildFieldIdByName([
        { databaseId: 1, label: "Name" },
        { databaseId: 2, label: null },
        undefined,
        null,
      ]),
    ).toEqual({ name: 1 });
    expect(buildFieldIdByName(null)).toEqual({});
    expect(buildFieldIdByName(undefined)).toEqual({});
  });
});

describe("buildFieldValues", () => {
  const fieldIdByName = {
    name: 1,
    email: 2,
    message: 3,
    product_name: 4,
    product_url: 5,
  };

  it("attaches the numeric databaseId to every known field, visible or hidden", () => {
    const values = {
      name: "Ada",
      email: "ada@example.com",
      // injected hidden product context — the ENG-794 regression: these MUST
      // carry their id so the commerce provider does not drop them.
      product_name: "Trail Bike",
      product_url: "https://shop.test/products/trail-bike",
    };
    expect(buildFieldValues(values, fieldIdByName)).toEqual([
      { id: 1, value: "Ada" },
      { id: 2, value: "ada@example.com" },
      { id: 4, value: "Trail Bike" },
      { id: 5, value: "https://shop.test/products/trail-bike" },
    ]);
  });

  it("sends unknown keys without an id (preserves prior contract)", () => {
    expect(buildFieldValues({ mystery: "x" }, fieldIdByName)).toEqual([
      { value: "x" },
    ]);
  });

  it("coerces nullish values to empty strings", () => {
    expect(
      buildFieldValues({ name: undefined as unknown as string }, fieldIdByName),
    ).toEqual([{ id: 1, value: "" }]);
  });
});
