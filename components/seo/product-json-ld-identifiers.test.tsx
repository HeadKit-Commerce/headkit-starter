import { describe, expect, it, vi } from "vitest";

/**
 * GTIN/MPN in the PDP's JSON-LD (Bike Society PDP gap scout, item 21/28).
 * GTIN uses the length-specific `gtin8`/`gtin12`/`gtin13`/`gtin14` key when
 * the digit count is unambiguous, else falls back to plain `gtin` — a wrong
 * key is worse than none. A simple product carries its identifiers directly;
 * a variable product's `hasVariant[]` entries carry their OWN identifiers,
 * independent of the parent and of each other.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(async () => ({
    storeSettings: { name: "Acme", domain: "store.example" },
    seoSettings: { allowIndexing: true },
  })),
}));

import { ProductJsonLD } from "./product-json-ld";

type ScriptElement = { props: { dangerouslySetInnerHTML: { __html: string } } };

async function graphOf(
  element: Promise<unknown>,
): Promise<Record<string, unknown>> {
  const rendered = (await element) as ScriptElement;
  return JSON.parse(rendered.props.dangerouslySetInnerHTML.__html) as Record<
    string,
    unknown
  >;
}

const BASE_SIMPLE = {
  id: "1",
  name: "Shoe",
  slug: "shoe",
  sku: "SKU-1",
  price: "750",
  type: "simple",
  stockStatus: "instock",
  shortDescription: "A shoe",
  image: { src: "https://cdn.example/shoe.jpg" },
  images: [],
  attributes: [],
  variations: [],
};

describe("ProductJsonLD — GTIN/MPN", () => {
  it("puts a 13-digit GTIN under the specific gtin13 key", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: {
          ...BASE_SIMPLE,
          gtin: "1966252956839",
          mpn: null,
        } as unknown as Parameters<typeof ProductJsonLD>[0]["product"],
      }),
    );
    expect(graph.gtin13).toBe("1966252956839");
    expect(graph.gtin).toBeUndefined();
    expect(graph.mpn).toBeUndefined();
  });

  it("puts a 12-digit GTIN (UPC) under gtin12, and carries mpn", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: {
          ...BASE_SIMPLE,
          gtin: "196625295683",
          mpn: "61026-4842",
        } as unknown as Parameters<typeof ProductJsonLD>[0]["product"],
      }),
    );
    expect(graph.gtin12).toBe("196625295683");
    expect(graph.mpn).toBe("61026-4842");
  });

  it("falls back to plain gtin for an ambiguous digit count", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: {
          ...BASE_SIMPLE,
          gtin: "12345",
          mpn: null,
        } as unknown as Parameters<typeof ProductJsonLD>[0]["product"],
      }),
    );
    expect(graph.gtin).toBe("12345");
    expect(graph.gtin8).toBeUndefined();
  });

  it("omits gtin/mpn entirely when neither is set", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: {
          ...BASE_SIMPLE,
          gtin: null,
          mpn: null,
        } as unknown as Parameters<typeof ProductJsonLD>[0]["product"],
      }),
    );
    expect(graph.gtin).toBeUndefined();
    expect(graph.gtin8).toBeUndefined();
    expect(graph.gtin12).toBeUndefined();
    expect(graph.gtin13).toBeUndefined();
    expect(graph.gtin14).toBeUndefined();
    expect(graph.mpn).toBeUndefined();
  });

  it("gives each hasVariant entry its OWN gtin/mpn, independent of siblings", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: {
          ...BASE_SIMPLE,
          type: "variable",
          gtin: null,
          mpn: null,
          attributes: [{ slug: "pa_colour", variation: true, visible: true }],
          variations: [
            {
              sku: "SKU-1-WHITE",
              price: "750",
              stockStatus: "instock",
              attributes: [{ key: "pa_colour", value: "white" }],
              image: { src: "https://cdn.example/white.jpg" },
              gtin: "196625295683",
              mpn: "61026-4842",
            },
            {
              sku: "SKU-1-BLACK",
              price: "750",
              stockStatus: "instock",
              attributes: [{ key: "pa_colour", value: "black" }],
              image: { src: "https://cdn.example/black.jpg" },
              gtin: null,
              mpn: null,
            },
          ],
        } as unknown as Parameters<typeof ProductJsonLD>[0]["product"],
      }),
    );

    const variants = graph.hasVariant as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(2);
    expect(variants[0]?.gtin12).toBe("196625295683");
    expect(variants[0]?.mpn).toBe("61026-4842");
    expect(variants[1]?.gtin).toBeUndefined();
    expect(variants[1]?.gtin12).toBeUndefined();
    expect(variants[1]?.mpn).toBeUndefined();
  });
});
