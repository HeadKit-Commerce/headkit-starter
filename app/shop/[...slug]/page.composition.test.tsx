import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

/**
 * Where the nested `/shop/[...slug]` route puts its boundary, per branch.
 *
 * The product branch renders `ProductPageBody` DIRECTLY in the route — no
 * `<Suspense>` above it — so the whole PDP is baked into the prerendered
 * static shell and shows with JavaScript off. Any boundary around it puts the
 * product after the visible shell: postponed when its subtree performs a
 * request-time read (the old `ProductPageContent` awaited `searchParams`),
 * and outlined by React regardless once the completed boundary exceeds
 * `progressiveChunkSize` (12 800 bytes). Measured on the Bike Society
 * rehearsal store, 2026-09-10: 826 visible characters, the product behind
 * `B:2`. The flat route's own file, `app/products/[...slug]/page.tsx`, owns
 * the account; `scripts/static-shell-split.ts` measures a built file.
 *
 * The category branch keeps a boundary on purpose: `CollectionRoute` reads
 * `searchParams` for its grid, which must sit below one, and the fallback is
 * the collection route's skeleton rather than the PDP's.
 *
 * The 404 gate (index / unknown / no candidate) is `app/not-found-status.test.ts`;
 * metadata and `generateStaticParams` are `./page.test.ts`.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: "pk_store",
    NEXT_PUBLIC_GRAPHQL_URL: "https://graph.example.test/graphql",
    HEADKIT_PRIVATE_KEY: "sk_store",
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: (): void => {},
  cacheLife: (): void => {},
}));

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  unstable_rethrow: (): void => {},
}));

const TREE = [
  { slug: "clothing", children: [{ slug: "hoodies", children: [] }] },
  { slug: "accessories", children: [] },
];

vi.mock("@/lib/sdk", () => ({
  headkit: {
    collections: {
      getCategories: (): Promise<unknown> => Promise.resolve(TREE),
      getCategory: (): Promise<null> => Promise.resolve(null),
    },
    products: { list: (): Promise<never> => Promise.reject(new Error("off")) },
  },
}));

const { getCachedProduct } = vi.hoisted(() => ({
  getCachedProduct: vi.fn<(slug: string) => Promise<unknown>>(),
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (slug: string): Promise<unknown> => getCachedProduct(slug),
  getProductForPage: (slug: string): Promise<unknown> => getCachedProduct(slug),
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      branding: {},
      seoSettings: { allowIndexing: true, ogImageUrl: null },
      storeSettings: { name: "Test Store", domain: "shop.example" },
    }),
  getBrandingAssets: (): Promise<Record<string, never>> => Promise.resolve({}),
}));

// The flat PDP module is what this route delegates to; only the body is
// stubbed, and by identity, so the route's element type can be compared to it.
vi.mock("@/app/products/[...slug]/page", () => ({
  ProductPageBody: (): null => null,
  ProductPageContent: (): null => null,
  generateMetadata: (): Promise<Record<string, never>> => Promise.resolve({}),
}));
vi.mock("@/app/collections/[...slug]/page", () => ({
  CollectionRoute: (): null => null,
}));
vi.mock("@/components/headkit-ui/skeletons/collection-page-skeleton", () => ({
  CollectionPageSkeleton: (): null => null,
  CollectionProductsSkeleton: (): null => null,
}));

import Page from "./page";
import { ProductPageBody } from "@/app/products/[...slug]/page";
import { CollectionRoute } from "@/app/collections/[...slug]/page";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";

const HOODIE = {
  id: "p1",
  name: "Blue Hoodie",
  slug: "blue-hoodie",
  uri: "https://commerce.example.com/shop/clothing/hoodies/blue-hoodie/",
  categories: [],
  attributes: [],
  variations: [],
};

function trackedSearchParams(): {
  promise: Promise<Record<string, string>>;
  awaited: () => boolean;
} {
  let awaited = false;
  const thenable = {
    then(resolve: (v: Record<string, string>) => unknown): unknown {
      awaited = true;
      return Promise.resolve({}).then(resolve);
    },
  };
  return {
    promise: thenable as unknown as Promise<Record<string, string>>,
    awaited: () => awaited,
  };
}

beforeEach(() => {
  getCachedProduct.mockReset();
  getCachedProduct.mockImplementation((slug) =>
    Promise.resolve(slug === HOODIE.slug ? HOODIE : null),
  );
});

describe("shop/[...slug] — the product branch renders OUTSIDE any boundary", () => {
  it("returns ProductPageBody with the verified product, not a Suspense wrapper", async () => {
    const searchParams = trackedSearchParams();

    const element = (await Page({
      params: Promise.resolve({ slug: ["clothing", "hoodies", "blue-hoodie"] }),
      searchParams: searchParams.promise,
    })) as ReactElement<{
      product: unknown;
      productSlug: string;
      colorSlug: unknown;
    }>;

    expect(
      element.type,
      "the product the gate just verified is composed in the route itself; a boundary above it would put every product byte after the visible shell",
    ).toBe(ProductPageBody);
    expect(element.type).not.toBe(Suspense);
    expect(
      element.props.product,
      "the very object the probe resolved — one cached read, no second lookup",
    ).toBe(HOODIE);
    expect(element.props.productSlug).toBe("blue-hoodie");
    expect(element.props.colorSlug).toBeUndefined();
    expect(
      searchParams.awaited(),
      "a nested PDP never reads searchParams — a draft cannot reach this route",
    ).toBe(false);
  });

  it("hands the colourway segment to the body", async () => {
    const element = (await Page({
      params: Promise.resolve({
        slug: ["clothing", "hoodies", "blue-hoodie", "red"],
      }),
    })) as ReactElement<{ productSlug: string; colorSlug: unknown }>;

    expect(element.type).toBe(ProductPageBody);
    expect(element.props.productSlug).toBe("blue-hoodie");
    expect(element.props.colorSlug).toBe("red");
  });
});

describe("shop/[...slug] — the category branch keeps its boundary", () => {
  it("wraps CollectionRoute in Suspense with the collection skeleton and forwards searchParams unawaited", async () => {
    const searchParams = trackedSearchParams();

    const element = (await Page({
      params: Promise.resolve({ slug: ["clothing", "hoodies"] }),
      searchParams: searchParams.promise,
    })) as ReactElement<{
      fallback: ReactElement;
      children: ReactElement<{
        searchParams: unknown;
        params: Promise<unknown>;
      }>;
    }>;

    expect(
      element.type,
      "the collection grid reads searchParams — a request-time read that must sit below a boundary",
    ).toBe(Suspense);
    expect(
      element.props.fallback.type,
      "the fallback is the collection route's own skeleton, not the PDP's",
    ).toBe(CollectionPageSkeleton);
    expect(element.props.children.type).toBe(CollectionRoute);
    expect(element.props.children.props.searchParams).toBe(
      searchParams.promise,
    );
    expect(searchParams.awaited(), "forwarded, never read here").toBe(false);
    await expect(element.props.children.props.params).resolves.toEqual({
      slug: ["clothing", "hoodies"],
    });
  });
});

describe("shop/[...slug] — the gate still decides before either branch", () => {
  it("404s a path whose candidates resolve to no product", async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: ["clothing", "no-such"] }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK/);
  });

  it("404s the build-time placeholder without a lookup", async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: ["__hk_static_placeholder"] }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK/);
    expect(getCachedProduct).not.toHaveBeenCalled();
  });
});
