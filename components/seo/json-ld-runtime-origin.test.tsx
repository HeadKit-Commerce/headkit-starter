import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every shopper-facing URL in a JSON-LD graph must name the SAME host as the
 * canonical the route emits — which `storefrontUrl(..., storeSettings.domain)`
 * resolves from the RUNTIME store domain. These components used to build their
 * URLs from the build-time `NEXT_PUBLIC_FRONTEND_URL`, so a store whose custom
 * domain was attached without a redeploy served one document naming two hosts
 * (canonical on the apex, JSON-LD on the stale `*.headkit.app`).
 */

const BAKED_ENV = "https://stale.headkit.app";
const RUNTIME_DOMAIN = "customer.com";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FRONTEND_URL = "https://stale.headkit.app";
});

vi.mock("server-only", () => ({}));

/** Mutable per test: `null` = store has no custom domain. */
let storeDomain: string | null = RUNTIME_DOMAIN;

vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(async () => ({
    storeSettings: { name: "Acme", domain: storeDomain },
    seoSettings: { allowIndexing: true },
  })),
}));

import { ArticleJsonLD } from "./article-json-ld";
import { BreadcrumbJsonLD } from "./breadcrumb-json-ld";
import { CarouselPostJsonLD } from "./carousel-post-json-ld";
import { CarouselProductJsonLD } from "./carousel-product-json-ld";
import { ProductJsonLD } from "./product-json-ld";

/** What an async JSON-LD server component resolves to: one <script> element. */
type ScriptElement = { props: { dangerouslySetInnerHTML: { __html: string } } };

/** The JSON-LD payload a component serialised into its <script> tag. */
async function graphOf(
  element: Promise<unknown>,
): Promise<Record<string, unknown>> {
  const rendered = (await element) as ScriptElement;
  return JSON.parse(rendered.props.dangerouslySetInnerHTML.__html) as Record<
    string,
    unknown
  >;
}

const PRODUCT = {
  id: "1",
  name: "Chair",
  slug: "chair",
  sku: "SKU-1",
  price: "100",
  type: "simple",
  stockStatus: "instock",
  shortDescription: "A chair",
  image: { src: "https://cdn.example/chair.jpg" },
  images: [],
  attributes: [],
  variations: [],
} as unknown as Parameters<typeof ProductJsonLD>[0]["product"];

describe("JSON-LD components resolve the runtime store domain", () => {
  beforeEach(() => {
    storeDomain = RUNTIME_DOMAIN;
  });

  it("ProductJsonLD names the runtime domain in url and the offer url", async () => {
    const graph = await graphOf(ProductJsonLD({ product: PRODUCT }));

    expect(graph.url).toBe(`https://${RUNTIME_DOMAIN}/products/chair`);
    expect((graph.offers as { url: string }).url).toBe(
      `https://${RUNTIME_DOMAIN}/products/chair`,
    );
    expect(JSON.stringify(graph)).not.toContain(BAKED_ENV);
  });

  it("BreadcrumbJsonLD names the runtime domain in every item", async () => {
    const graph = await graphOf(
      BreadcrumbJsonLD({
        items: [
          { name: "Home", href: "/" },
          { name: "Chair", href: "/products/chair" },
        ],
      }),
    );

    const items = graph.itemListElement as { item: string }[];
    expect(items.map((entry) => entry.item)).toEqual([
      `https://${RUNTIME_DOMAIN}/`,
      `https://${RUNTIME_DOMAIN}/products/chair`,
    ]);
  });

  it("ArticleJsonLD puts author/publisher on the same host as the url", async () => {
    const graph = await graphOf(
      ArticleJsonLD({
        seo: { title: "Post" } as never,
        siteName: "Acme",
        url: `https://${RUNTIME_DOMAIN}/news/post`,
      }),
    );

    expect((graph.author as { url: string }).url).toBe(
      `https://${RUNTIME_DOMAIN}`,
    );
    expect((graph.publisher as { url: string }).url).toBe(
      `https://${RUNTIME_DOMAIN}`,
    );
  });

  it("carousel graphs name the runtime domain", async () => {
    const posts = await graphOf(
      CarouselPostJsonLD({
        posts: [{ title: "Post", slug: "post", date: "2026-01-01" }] as never,
      }),
    );
    const products = await graphOf(
      CarouselProductJsonLD({
        products: [
          {
            name: "Chair",
            slug: "chair",
            price: "100",
            salePrice: null,
            stockStatus: "instock",
          },
        ] as never,
      }),
    );

    expect(JSON.stringify(posts)).toContain(`https://${RUNTIME_DOMAIN}/news/`);
    expect(JSON.stringify(products)).toContain(
      `https://${RUNTIME_DOMAIN}/products/chair`,
    );
    expect(JSON.stringify(posts)).not.toContain(BAKED_ENV);
    expect(JSON.stringify(products)).not.toContain(BAKED_ENV);
  });

  it("falls back to the baked env when the store has no custom domain", async () => {
    storeDomain = null;

    const graph = await graphOf(ProductJsonLD({ product: PRODUCT }));

    expect(graph.url).toBe(`${BAKED_ENV}/products/chair`);
  });

  it("an explicit siteUrl prop wins over both", async () => {
    const graph = await graphOf(
      ProductJsonLD({
        product: PRODUCT,
        siteUrl: "https://override.example",
      }),
    );

    expect(graph.url).toBe("https://override.example/products/chair");
  });
});
