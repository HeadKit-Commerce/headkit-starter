import { describe, expect, it } from "vitest";
import {
  isQuoteMode,
  normalizeCheckoutMode,
} from "./checkout-mode";

describe("normalizeCheckoutMode", () => {
  it("maps quote variants to quote", () => {
    expect(normalizeCheckoutMode("quote")).toBe("quote");
    expect(normalizeCheckoutMode("QUOTE")).toBe("quote");
    expect(normalizeCheckoutMode(" Quote ")).toBe("quote");
  });

  it("defaults everything else to custom", () => {
    expect(normalizeCheckoutMode(undefined)).toBe("custom");
    expect(normalizeCheckoutMode(null)).toBe("custom");
    expect(normalizeCheckoutMode("")).toBe("custom");
    expect(normalizeCheckoutMode("custom")).toBe("custom");
    expect(normalizeCheckoutMode("CUSTOM")).toBe("custom");
    expect(normalizeCheckoutMode("other")).toBe("custom");
  });
});

describe("isQuoteMode", () => {
  it("is true only for quote", () => {
    expect(isQuoteMode("quote")).toBe(true);
    expect(isQuoteMode("custom")).toBe(false);
  });
});
