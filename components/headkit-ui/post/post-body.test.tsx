import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

/**
 * A post rendered from HYDRATED `editorBlocks` makes no per-product read.
 *
 * `PostBody` used to hand `processHomepageContent` an empty block list, so
 * every `headkit-product-carousel` section fell through to the HTML-scan
 * fallback and re-read each product on every request — 24 products on one
 * sale post serialised into ~14 s behind commerce's 1.8 req/s origin bucket.
 * The `GetContent` payload the route already caches carries those products
 * (`editorBlocks[].products`, `ProductSummaryFields`), and threading them
 * through measured 14 s → 1.0 s with the same carousels and product links.
 *
 * This drives the REAL `BlockEditor` → `HeadKitProductCarouselSection` →
 * `resolveCarouselProductsFromHtml` chain, stubbing only leaf presentation
 * and the two reads, so the assertion is about the fetch count, not a mock
 * of the decision.
 */

const {
  getCachedProduct,
  productsGet,
  productCarouselProps,
  editorialContentProps,
} = vi.hoisted(() => ({
  getCachedProduct: vi.fn<(slug: string) => Promise<unknown>>(),
  productsGet: vi.fn<(slug: string) => Promise<unknown>>(),
  productCarouselProps: vi.fn<(props: Record<string, unknown>) => void>(),
  editorialContentProps: vi.fn<(props: Record<string, unknown>) => void>(),
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (slug: string): Promise<unknown> => getCachedProduct(slug),
}));
vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => productsGet(slug) },
  },
}));
vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({ branding: { hideEmptyCollections: false } }),
}));
vi.mock("@/lib/store-theme", () => ({
  getStoreTheme: (): unknown => ({ layout: { heroLayout: "inset" } }),
}));
vi.mock("@/lib/hide-empty-collections", () => ({
  getNonEmptyCollectionSlugs: (): Promise<null> => Promise.resolve(null),
  filterCategoriesByNonEmptySlugs: (c: unknown): unknown => c,
}));
vi.mock("@/lib/collection-path", () => ({
  collectionPathResolver: (): Promise<(slug: string) => string> =>
    Promise.resolve((slug: string) => `/collections/${slug}`),
}));
vi.mock("@/lib/sanitize-content", () => ({
  sanitizeContent: (html: string): Promise<string> => Promise.resolve(html),
}));

vi.mock("@/components/headkit-ui/product-carousel", () => ({
  ProductCarousel: (props: Record<string, unknown>): null => {
    productCarouselProps(props);
    return null;
  },
}));
vi.mock("@/components/headkit-ui/editorial-content", () => ({
  EditorialContent: (props: Record<string, unknown>): null => {
    editorialContentProps(props);
    return null;
  },
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/headkit-ui/category-carousel", () => ({
  CategoryCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/brand-carousel", () => ({
  BrandCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/client-carousel", () => ({
  ClientCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/post/post-carousel", () => ({
  PostCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/project/project-carousel", () => ({
  ProjectCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/main-carousel", () => ({
  MainCarousel: (): null => null,
}));
vi.mock("@/components/ui/button", () => ({ Button: (): null => null }));

import { PostBody } from "./post-body";

/**
 * Resolve every (async) function component in a server tree so the leaf
 * recorders fire. `react-dom/server` cannot render async components, and the
 * decision under test lives two async components below `PostBody`.
 */
async function drain(node: ReactNode): Promise<void> {
  if (Array.isArray(node)) {
    for (const child of node) await drain(child);
    return;
  }
  if (!node || typeof node !== "object") return;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function") {
    const render = element.type as (
      props: unknown,
    ) => ReactNode | Promise<ReactNode>;
    await drain(await render(element.props));
    return;
  }
  await drain(element.props?.children);
}

function productList(slugs: string[]): string {
  const lis = slugs
    .map(
      (slug) =>
        `<li class="wc-block-grid__product"><a class="wc-block-grid__product-link" href="https://example.com/product/${slug}/">${slug}</a></li>`,
    )
    .join("");
  return `<div class="wc-block-grid headkit-product-lists"><ul class="wc-block-grid__products">${lis}</ul></div>`;
}

/** One `headkit-product-carousel` section whose markup ALSO names its products. */
function carouselSection(title: string, slugs: string[]): string {
  return (
    `<div class="wp-block-group headkit-product-carousel headkit-block-section">` +
    `<div class="wp-block-group__inner-container">` +
    `<h2 class="wp-block-heading headkit-block-title">${title}</h2>` +
    productList(slugs) +
    `</div></div>`
  );
}

const SALE_SLUGS = ["chair-one", "desk-two", "lamp-three"];
const NEW_SLUGS = ["bike-four", "helmet-five"];
const HTML =
  `<p>Intro copy.</p>` +
  carouselSection("Sale", SALE_SLUGS) +
  `<p>Between the carousels.</p>` +
  carouselSection("New in", NEW_SLUGS);

const hydrated = (slug: string): Record<string, unknown> => ({
  id: `id-${slug}`,
  slug,
  name: slug,
});

beforeEach(() => {
  getCachedProduct.mockReset();
  productsGet.mockReset();
  productCarouselProps.mockClear();
  editorialContentProps.mockClear();
  getCachedProduct.mockImplementation((slug) =>
    Promise.resolve({ id: `cached-${slug}`, slug, name: slug }),
  );
});

describe("PostBody — hydrated editorBlocks", () => {
  it("renders every carousel from the hydrated products with ZERO product reads", async () => {
    await drain(
      await PostBody({
        html: HTML,
        editorBlocks: [
          {
            products: SALE_SLUGS.map(hydrated),
            queryType: "handpicked-products",
          },
          {
            products: NEW_SLUGS.map(hydrated),
            queryType: "handpicked-products",
          },
        ],
      }),
    );

    // Both carousels rendered, in document order, from the block payload.
    const rendered = productCarouselProps.mock.calls.map(([props]) =>
      (props["products"] as Array<{ slug: string }>).map((p) => p.slug),
    );
    expect(rendered).toEqual([SALE_SLUGS, NEW_SLUGS]);
    // The whole point: no fallback read of any kind, cached or not.
    expect(getCachedProduct).not.toHaveBeenCalled();
    expect(productsGet).not.toHaveBeenCalled();
    // Prose segments still take the editorial path around the sections.
    expect(editorialContentProps).toHaveBeenCalledTimes(2);
  });
});

describe("PostBody — blocks not hydrated (fallback)", () => {
  it("still resolves the carousel from the markup, through the cached reader only", async () => {
    await drain(await PostBody({ html: HTML, editorBlocks: [] }));

    const rendered = productCarouselProps.mock.calls.map(([props]) =>
      (props["products"] as Array<{ slug: string }>).map((p) => p.slug),
    );
    expect(rendered).toEqual([SALE_SLUGS, NEW_SLUGS]);
    expect(getCachedProduct.mock.calls.map(([slug]) => slug)).toEqual([
      ...SALE_SLUGS,
      ...NEW_SLUGS,
    ]);
    expect(productsGet).not.toHaveBeenCalled();
  });

  it("treats a block WITHOUT products the same as no block (omitted prop)", async () => {
    await drain(
      await PostBody({
        html: carouselSection("Sale", SALE_SLUGS),
        editorBlocks: [{ products: [], queryType: "handpicked-products" }],
      }),
    );
    expect(productCarouselProps).toHaveBeenCalledTimes(1);
    expect(getCachedProduct.mock.calls.map(([slug]) => slug)).toEqual(
      SALE_SLUGS,
    );
    expect(productsGet).not.toHaveBeenCalled();

    productCarouselProps.mockClear();
    getCachedProduct.mockClear();
    await drain(await PostBody({ html: carouselSection("Sale", SALE_SLUGS) }));
    expect(productCarouselProps).toHaveBeenCalledTimes(1);
    expect(getCachedProduct).toHaveBeenCalledTimes(SALE_SLUGS.length);
    expect(productsGet).not.toHaveBeenCalled();
  });
});
