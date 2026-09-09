import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The HTML-scan fallback resolves products through the PDP's cache entry, not
 * a bare SDK read.
 *
 * Before this guard the fallback called `headkit.products.get(slug)` once per
 * product with no cache, so a post whose carousel blocks were not hydrated
 * paid one paced origin read per product on EVERY request — 24 products
 * serialised into ~14 s behind commerce's 1.8 req/s origin bucket. Routing the
 * read through `getCachedProduct` shares the PDP entry (`TAG.product(slug)` +
 * `TAG.products`, `days`), so a warm carousel costs no origin read.
 */

const { getCachedProduct, productsGet } = vi.hoisted(() => ({
  getCachedProduct: vi.fn<(slug: string) => Promise<unknown>>(),
  productsGet: vi.fn<(slug: string) => Promise<unknown>>(),
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (slug: string): Promise<unknown> => getCachedProduct(slug),
}));
vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => productsGet(slug) },
  },
}));

import { resolveCarouselProductsFromHtml } from "./resolve-carousel-products-from-html";

function list(items: Array<{ slug: string; colourway?: string }>): string {
  const lis = items
    .map(
      ({ slug, colourway }) =>
        `<li class="wc-block-grid__product"${colourway ? ` data-colourway="${colourway}"` : ""}>` +
        `<a class="wc-block-grid__product-link" href="https://example.com/product/${slug}/">${slug}</a></li>`,
    )
    .join("");
  return `<div class="wc-block-grid headkit-product-lists"><ul class="wc-block-grid__products">${lis}</ul></div>`;
}

beforeEach(() => {
  getCachedProduct.mockReset();
  productsGet.mockReset();
  getCachedProduct.mockImplementation((slug) =>
    Promise.resolve({ id: `id-${slug}`, slug }),
  );
});

describe("resolveCarouselProductsFromHtml — the fallback reads through the cache", () => {
  it("resolves every unique slug via getCachedProduct and never via the bare SDK read", async () => {
    const html =
      list([{ slug: "chair-one", colourway: "navy" }, { slug: "desk-two" }]) +
      list([{ slug: "desk-two" }, { slug: "lamp-three" }]);

    const { products, colourwayPins } =
      await resolveCarouselProductsFromHtml(html);

    // One cached read per UNIQUE slug, in first-seen document order.
    expect(getCachedProduct.mock.calls.map(([slug]) => slug)).toEqual([
      "chair-one",
      "desk-two",
      "lamp-three",
    ]);
    // The uncached per-request read is gone for good.
    expect(productsGet).not.toHaveBeenCalled();

    expect(products.map((p) => p.slug)).toEqual([
      "chair-one",
      "desk-two",
      "lamp-three",
    ]);
    expect(colourwayPins).toEqual({ "id-chair-one": "navy" });
  });

  it("drops a product whose cached read fails or returns null, keeping the rest", async () => {
    getCachedProduct.mockImplementation((slug) =>
      slug === "desk-two"
        ? Promise.reject(new Error("origin unreachable"))
        : slug === "lamp-three"
          ? Promise.resolve(null)
          : Promise.resolve({ id: `id-${slug}`, slug }),
    );
    const { products } = await resolveCarouselProductsFromHtml(
      list([
        { slug: "chair-one" },
        { slug: "desk-two" },
        { slug: "lamp-three" },
      ]),
    );
    expect(products.map((p) => p.slug)).toEqual(["chair-one"]);
    expect(productsGet).not.toHaveBeenCalled();
  });

  it("makes no read at all when the HTML carries no handpicked list", async () => {
    const result = await resolveCarouselProductsFromHtml("<p>Prose only</p>");
    expect(result).toEqual({ products: [], colourwayPins: {} });
    expect(getCachedProduct).not.toHaveBeenCalled();
    expect(productsGet).not.toHaveBeenCalled();
  });
});
