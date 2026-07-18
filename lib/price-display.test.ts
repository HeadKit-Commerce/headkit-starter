import { describe, it, expect } from "vitest";
import { getPriceDisplay } from "@/lib/price-display";

describe("getPriceDisplay", () => {
  it("shows a real discount: regular > sale, on sale", () => {
    expect(
      getPriceDisplay({ price: "24", regularPrice: "32", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: 32 });
  });

  it("suppresses the fake strikethrough when regular price is unknown (variable products)", () => {
    // F3 root cause: variable products surface regularPrice "" with onSale=true;
    // the old fallback rendered "~~$24.00~~ $24.00".
    expect(
      getPriceDisplay({ price: "24", regularPrice: "", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: null });
  });

  it("suppresses the strikethrough when regular equals the sale price", () => {
    expect(
      getPriceDisplay({ price: "24", regularPrice: "24", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: null });
  });

  it("suppresses the strikethrough when regular is lower than the current price", () => {
    expect(
      getPriceDisplay({ price: "24", regularPrice: "20", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: null });
  });

  it("never strikes through when not on sale, even with a higher regular price", () => {
    expect(
      getPriceDisplay({ price: "24", regularPrice: "32", onSale: false }),
    ).toEqual({ min: 24, max: null, struck: null });
  });

  it("returns a range without strikethrough", () => {
    expect(
      getPriceDisplay({ price: "25 - 36", regularPrice: "", onSale: true }),
    ).toEqual({ min: 25, max: 36, struck: null });
  });

  it("handles currency symbols and undefined regular price", () => {
    expect(
      getPriceDisplay({ price: "$24.00", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: null });
    expect(
      getPriceDisplay({ price: "$24.00", regularPrice: "$32.00", onSale: true }),
    ).toEqual({ min: 24, max: null, struck: 32 });
  });

  it("handles empty price", () => {
    expect(getPriceDisplay({ price: "", onSale: false })).toEqual({
      min: 0,
      max: null,
      struck: null,
    });
  });
});
