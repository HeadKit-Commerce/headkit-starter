import { describe, expect, it } from "vitest";
import { productSubtitle } from "./product-subtitle";

describe("productSubtitle", () => {
  it("returns the Velvet Size / Immersion line", () => {
    expect(productSubtitle("Immersion")).toBe("Immersion");
  });

  it("hides empty or whitespace-only values", () => {
    expect(productSubtitle(null)).toBe("");
    expect(productSubtitle(undefined)).toBe("");
    expect(productSubtitle("   ")).toBe("");
  });

  it("hides non-string values from an older SDK Product type", () => {
    expect(productSubtitle({ size: "Immersion" })).toBe("");
    expect(productSubtitle(12)).toBe("");
  });

  it("strips leftover HTML from a metafield", () => {
    expect(productSubtitle("<p>Immersion</p>")).toBe("Immersion");
  });
});
