import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductIdentifiers } from "./product-identifiers";

describe("ProductIdentifiers", () => {
  it("renders NOTHING when both gtin and mpn are missing — no empty labels", () => {
    expect(renderToStaticMarkup(<ProductIdentifiers />)).toBe("");
    expect(
      renderToStaticMarkup(<ProductIdentifiers gtin={null} mpn={null} />),
    ).toBe("");
    expect(renderToStaticMarkup(<ProductIdentifiers gtin="" mpn="   " />)).toBe(
      "",
    );
  });

  it("renders only the GTIN line when mpn is missing", () => {
    const html = renderToStaticMarkup(
      <ProductIdentifiers gtin="196625295683" mpn={null} />,
    );
    expect(html).toContain("GTIN: 196625295683");
    expect(html).not.toContain("MPN:");
    expect(html).toContain('data-testid="product-identifiers"');
  });

  it("renders only the MPN line when gtin is missing", () => {
    const html = renderToStaticMarkup(
      <ProductIdentifiers gtin={null} mpn="61026-4842" />,
    );
    expect(html).not.toContain("GTIN:");
    expect(html).toContain("MPN: 61026-4842");
  });

  it("renders both on one line when both are present", () => {
    const html = renderToStaticMarkup(
      <ProductIdentifiers gtin="196625295683" mpn="61026-4842" />,
    );
    expect(html).toContain("GTIN: 196625295683");
    expect(html).toContain("MPN: 61026-4842");
    // One line — a single <p>, not two.
    expect(html.match(/<p/g)?.length).toBe(1);
  });
});
