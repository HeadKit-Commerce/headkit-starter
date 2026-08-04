import { describe, it, expect, afterEach, vi } from "vitest";
import {
  formatPrice,
  getStoreCurrency,
  getFloatVal,
  decodeHtmlEntities,
} from "@/lib/utils";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("decodeHtmlEntities", () => {
  it("decodes common named and numeric entities", () => {
    expect(decodeHtmlEntities("A &#038; B")).toBe("A & B");
    expect(decodeHtmlEntities("Beds &amp; Mattresses")).toBe(
      "Beds & Mattresses",
    );
    expect(decodeHtmlEntities("Tom&apos;s")).toBe("Tom's");
    expect(decodeHtmlEntities("&quot;Sale&quot;")).toBe('"Sale"');
  });

  it("is a no-op for plain text", () => {
    expect(decodeHtmlEntities("Plain title")).toBe("Plain title");
  });
});

describe("getStoreCurrency", () => {
  it("defaults to AUD when NEXT_PUBLIC_STORE_CURRENCY is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_CURRENCY", "");
    expect(getStoreCurrency()).toBe("AUD");
  });

  it("uses NEXT_PUBLIC_STORE_CURRENCY when set", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_CURRENCY", "USD");
    expect(getStoreCurrency()).toBe("USD");
  });
});

describe("formatPrice", () => {
  it("formats an explicit currency code (cart/order path)", () => {
    expect(formatPrice(14, "AUD")).toBe("A$14.00");
    expect(formatPrice(14, "USD")).toBe("$14.00");
  });

  it("falls back to the store currency when no code is passed (catalog path, F6)", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_CURRENCY", "");
    // Catalog and cart must agree: default is the store currency (AUD),
    // not a hardcoded USD.
    expect(formatPrice(14)).toBe(formatPrice(14, "AUD"));
  });

  it("honours a configured store currency for the no-arg path", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_CURRENCY", "EUR");
    expect(formatPrice(14)).toBe("€14.00");
  });

  it("always renders two decimal places", () => {
    expect(formatPrice(1499, "USD")).toBe("$1,499.00");
    expect(formatPrice(11.5, "USD")).toBe("$11.50");
  });
});

describe("getFloatVal", () => {
  it("strips currency symbols and separators", () => {
    expect(getFloatVal("$24.00")).toBe(24);
    expect(getFloatVal("A$1499.50")).toBe(1499.5);
  });

  it("returns 0 for empty/nullish input", () => {
    expect(getFloatVal("")).toBe(0);
    expect(getFloatVal(null)).toBe(0);
    expect(getFloatVal(undefined)).toBe(0);
  });
});
