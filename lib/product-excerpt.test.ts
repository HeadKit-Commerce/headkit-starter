import { describe, expect, it } from "vitest";
import { distinctShortDescription } from "@/lib/product-excerpt";

describe("distinctShortDescription", () => {
  it("returns empty when Shopify copied the catalog description into the excerpt", () => {
    expect(
      distinctShortDescription(
        "The Velvet Monogram Heat - 75x140cm / 29.5x55 in",
        "<p>The Velvet Monogram Heat - 75x140cm / 29.5x55 in</p>",
      ),
    ).toBe("");
  });

  it("keeps a metafield excerpt that differs from the description", () => {
    expect(
      distinctShortDescription(
        "<p>75 × 140 cm bath towel</p>",
        "<p>The Velvet Monogram Heat - 75x140cm / 29.5x55 in</p>",
      ),
    ).toBe("<p>75 × 140 cm bath towel</p>");
  });

  it("returns empty when the excerpt is blank", () => {
    expect(distinctShortDescription("  ", "<p>Catalog copy</p>")).toBe("");
  });
});
