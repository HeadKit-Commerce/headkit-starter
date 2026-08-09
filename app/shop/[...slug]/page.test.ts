import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nested shop PDP route — D-15-04 / RESEARCH C-6.
 *
 * These cases pin the two properties a green build cannot prove:
 *  - `generateStaticParams` emits REAL nested params derived from each
 *    product's own permalink (asserted by count and by value, never by
 *    "not empty" — the placeholder alone would satisfy non-emptiness), and
 *    still degrades to exactly one placeholder when the catalogue read throws
 *  - the canonical for a nested URL is the NESTED path, and a category URL
 *    under /shop does not acquire a product canonical (C-6)
 */

const { SITE_URL } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url };
});

const productsList = vi.fn();
const getCategories = vi.fn();
const getCategory = vi.fn();
const cachedProduct = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: (...a: unknown[]): unknown => productsList(...a) },
    collections: {
      getCategories: (): unknown => getCategories(),
      getCategory: (s: string): unknown => getCategory(s),
    },
  },
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (s: string): unknown => cachedProduct(s),
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { ogImageUrl: null, allowIndexing: true },
      storeSettings: { name: "Acme" },
    }),
  getBrandingAssets: (): Promise<unknown> => Promise.resolve({ iconUrl: null }),
}));

// Echo the canonical back through a real Metadata shape so the assertions
// below read the value the route actually asked for.
vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (
    _seo: unknown,
    fallback: { canonical?: string; title?: string },
  ): Record<string, unknown> => ({
    title: fallback?.title,
    alternates: { canonical: fallback?.canonical },
  }),
  resolveStoreName: (): string => "Acme",
}));

// The route delegates rendering to the flat PDP and the collection view; the
// delegation targets are irrelevant to params/metadata and are stubbed out.
vi.mock("@/app/products/[...slug]/page", () => ({
  ProductPageContent: (): null => null,
}));
vi.mock("@/app/products/[...slug]/product-page-shell", () => ({
  ProductPageShell: (): null => null,
}));
vi.mock("@/app/collections/[...slug]/page", () => ({
  CollectionRoute: (): null => null,
}));

import { generateMetadata, generateStaticParams } from "./page";

const TREE = [
  { slug: "clothing", children: [{ slug: "hoodies", children: [] }] },
  { slug: "accessories", children: [] },
];

function page(products: unknown[], totalPages = 1) {
  return { products, totalPages };
}

beforeEach(() => {
  productsList.mockReset();
  getCategories.mockReset();
  getCategory.mockReset();
  cachedProduct.mockReset();
  getCategories.mockResolvedValue(TREE);
});

describe("generateStaticParams", () => {
  it("emits one nested param per product, derived from the product's own permalink", async () => {
    productsList.mockResolvedValue(
      page([
        { slug: "blue-hoodie", uri: `https://commerce.example.com/shop/clothing/hoodies/blue-hoodie/` },
        { slug: "red-tee", uri: `https://commerce.example.com/shop/clothing/red-tee/` },
        { slug: "cap", uri: `/shop/accessories/cap/` },
      ]),
    );

    const params = await generateStaticParams();

    expect(
      params.length,
      "a count, not non-emptiness: the single placeholder entry would satisfy 'not empty' while prerendering zero real products (CONTEXT trap 10)",
    ).toBe(3);
    expect(
      params,
      "each param must be the permalink's own nested segment array, with the shop prefix stripped — a synthesised flat guess is what D-15-04 replaces",
    ).toEqual([
      { slug: ["clothing", "hoodies", "blue-hoodie"] },
      { slug: ["clothing", "red-tee"] },
      { slug: ["accessories", "cap"] },
    ]);
  });

  it("skips products whose permalink is not under the shop prefix", async () => {
    productsList.mockResolvedValue(
      page([
        { slug: "blue-hoodie", uri: "https://commerce.example.com/shop/clothing/blue-hoodie/" },
        // A store on WooCommerce's default /product/ permalink base: this app
        // has no route serving it, so it must not be prerendered here.
        { slug: "off-base", uri: "https://commerce.example.com/product/off-base/" },
        { slug: "no-uri", uri: "" },
      ]),
    );

    const params = await generateStaticParams();

    expect(
      params,
      "a permalink outside /shop must be skipped, not coerced into a shop path — coercing would prerender a URL the app answers 404 for on every non-shop-permalink store",
    ).toEqual([{ slug: ["clothing", "blue-hoodie"] }]);
  });

  it("returns exactly one placeholder when the catalogue read throws", async () => {
    productsList.mockRejectedValue(new Error("gateway unreachable"));

    const params = await generateStaticParams();

    expect(
      params.length,
      "Cache Components forbids an empty generateStaticParams; a transient backend failure at build must not fail the whole tenant deploy (T-15.1-07-03)",
    ).toBe(1);
    expect(
      params[0]?.slug[0],
      "the single entry must be the placeholder, which metadata and the page resolve to noindex/not-found",
    ).toBe("__hk_static_placeholder");
  });

  it("paginates the product list to completion", async () => {
    productsList
      .mockResolvedValueOnce(
        page([{ slug: "a", uri: "/shop/clothing/a/" }], 2),
      )
      .mockResolvedValueOnce(
        page([{ slug: "b", uri: "/shop/clothing/b/" }], 2),
      );

    const params = await generateStaticParams();

    expect(
      params.length,
      "stopping after page 1 silently truncates the catalogue — the flat PDP paginates to completion and this route must match it",
    ).toBe(2);
  });
});

describe("generateMetadata", () => {
  it("canonicalises a nested product URL to the NESTED path", async () => {
    cachedProduct.mockResolvedValue({
      name: "Blue Hoodie",
      slug: "blue-hoodie",
      shortDescription: "",
      description: "",
      seo: null,
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies", "blue-hoodie"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "the canonical must be self-referential to the nested URL — pointing it at the flat /products path re-creates the very consolidation D-15-04 refuses",
    ).toBe(`${SITE_URL}/shop/clothing/hoodies/blue-hoodie`);
  });

  it("canonicalises a category URL to its own nested path and never to a product", async () => {
    getCategory.mockResolvedValue({
      name: "Hoodies",
      slug: "hoodies",
      description: "",
      seo: null,
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies"] }),
    });

    const canonical = (meta.alternates as { canonical?: string } | undefined)
      ?.canonical;

    expect(
      canonical,
      "RESEARCH C-6: a category URL under /shop must resolve as a category, not be treated as a product slug",
    ).toBe(`${SITE_URL}/shop/clothing/hoodies`);
    expect(
      cachedProduct,
      "a category path must never trigger a product lookup — that lookup returning null is what produced the 308-into-404",
    ).not.toHaveBeenCalled();
  });

  it("returns noindex for a path that cannot be resolved", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["not-a-category", "blue-hoodie"] }),
    });

    expect(
      meta.robots,
      "an undecidable path must be noindex rather than guessed into a product",
    ).toEqual({ index: false, follow: false });
    expect(
      cachedProduct,
      "an undecidable path must not reach the catalogue",
    ).not.toHaveBeenCalled();
  });

  it("returns noindex for the build-time placeholder", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["__hk_static_placeholder"] }),
    });

    expect(
      meta.robots,
      "the placeholder is never a real URL and must never be indexable",
    ).toEqual({ index: false, follow: false });
  });
});
