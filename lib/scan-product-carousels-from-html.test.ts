import { describe, expect, it } from "vitest";
import { scanProductCarouselsFromHtml } from "@/lib/scan-product-carousels-from-html";

describe("scanProductCarouselsFromHtml", () => {
  it("extracts product slugs and colourway pins in document order", () => {
    const html = `
      <div class="wc-block-grid headkit-product-lists has-3-columns">
        <ul class="wc-block-grid__products">
          <li class="wc-block-grid__product" data-colourway="navy">
            <a class="wc-block-grid__product-link" href="https://example.com/product/chair-one/">Chair</a>
          </li>
          <li class="wc-block-grid__product">
            <a href="https://example.com/product/desk-two/" class="wc-block-grid__product-link">Desk</a>
          </li>
        </ul>
      </div>
    `;
    const carousels = scanProductCarouselsFromHtml(html);
    expect(carousels).toHaveLength(1);
    expect(carousels[0]?.slugs).toEqual(["chair-one", "desk-two"]);
    expect(carousels[0]?.colourwaysBySlug).toEqual({ "chair-one": "navy" });
  });

  it("returns empty when no handpicked lists are present", () => {
    expect(scanProductCarouselsFromHtml("<p>Hello</p>")).toEqual([]);
  });
});
