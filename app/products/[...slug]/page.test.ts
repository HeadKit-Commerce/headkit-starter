import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * PDP cache-tag/life guard (09.5-04 / ENG-853).
 *
 * Since the 2026-08-22 canonical decision the redirect runs the other way: the
 * NESTED `/shop/[...slug]` is canonical on a store whose WooCommerce permalink
 * base carries the category, and this flat route 308s onto it. Both routes read
 * `getCachedProduct`, which owns the single cache entry tagged
 * `TAG.product(slug)` + `TAG.products` at `cacheLife('days')`.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const productsGet = vi.fn<(slug: string) => Promise<unknown>>();
const brandsGet = vi.fn<(slug: string) => Promise<unknown>>();
const withShopifyPreviewKey =
  vi.fn<(key: string) => { products: { get: typeof productsGet } }>();

vi.mock("server-only", () => ({}));

/**
 * Only the SINK is replaced. `errorFields` is the thing under test on the
 * no-raw-body assertion, so it runs for real.
 */
const { loggerError } = vi.hoisted(() => ({
  loggerError:
    vi.fn<(event: string, fields?: Record<string, unknown>) => void>(),
}));

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return {
    ...actual,
    logger: { ...actual.logger, error: loggerError },
  };
});

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { get: (slug: string): Promise<unknown> => productsGet(slug) },
    brands: { get: (slug: string): Promise<unknown> => brandsGet(slug) },
    withShopifyPreviewKey: (key: string) => {
      withShopifyPreviewKey(key);
      return { products: { get: productsGet } };
    },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      branding: { hideEmptyCollections: false, defaultCollectionSort: "" },
      seoSettings: { allowIndexing: true, ogImageUrl: null },
      storeSettings: { name: "Test Store", domain: "shop.example" },
    }),
  getBrandingAssets: (): Promise<Record<string, never>> => Promise.resolve({}),
}));

// page.tsx pulls in lib/stripe-config for the BNPL badge, which imports lib/env
// and runs its Zod parse at module scope — that throws under Vitest and would
// fail this file at COLLECT time, silently deleting the guards below rather
// than reddening them.
vi.mock("@/lib/stripe-config", () => ({
  getStripeConfig: (): Promise<{
    publishableKey: string;
    accountId: string;
    bnplMessagingEnabled: boolean;
  }> =>
    Promise.resolve({
      publishableKey: "",
      accountId: "",
      bnplMessagingEnabled: false,
    }),
}));

// lib/product-cache.ts itself imports lib/env too, for the bulk-prefetch
// discriminators (`NEXT_PHASE`, `HEADKIT_BULK_PREFETCH*`), and CI runs this
// suite with no storefront env — so the same module-scope parse would delete
// every guard below at COLLECT time. Same stand-in `lib/stripe-config.test.ts`
// uses. `NEXT_PHASE` is deliberately absent: off the build phase the prefetch
// is inert and `getCachedProduct` must be exactly the per-slug read
// (asserted below).
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: "pk_store",
    NEXT_PUBLIC_GRAPHQL_URL: "https://graph.example.test/graphql",
    HEADKIT_PRIVATE_KEY: "sk_store",
  },
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
  resolveStoreName: (): string => "Test Store",
  storefrontUrl: (path: string, domain?: string | null): string =>
    `https://${domain ?? "shop.example"}${path}`,
}));

/** Prop recorders for the two consumers of the display brand. */
const { productDetailProps, productJsonLdProps } = vi.hoisted(() => ({
  productDetailProps: vi.fn<(props: Record<string, unknown>) => void>(),
  productJsonLdProps: vi.fn<(props: Record<string, unknown>) => void>(),
}));

vi.mock("@/components/headkit-ui/product-detail", () => ({
  ProductDetail: (props: Record<string, unknown>): null => {
    productDetailProps(props);
    return null;
  },
}));
vi.mock("@/components/headkit-ui/product-stock", () => ({
  ProductStock: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-carousel", () => ({
  ProductCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/seo/product-json-ld", () => ({
  ProductJsonLD: (props: Record<string, unknown>): null => {
    productJsonLdProps(props);
    return null;
  },
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/headkit-ui/collection/utils", () => ({
  isColorAttrSlug: (): boolean => false,
  formatOptionName: (slug: string): string => slug,
}));
vi.mock("@/components/headkit-ui/project/project-carousel", () => ({
  ProjectCarousel: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  unstable_rethrow: (error: unknown): void => {
    if (
      error instanceof Error &&
      /NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/.test(error.message)
    ) {
      throw error;
    }
  },
}));

vi.mock("@/components/headkit-ui/project/project-carousel", () => ({
  ProjectCarousel: (): null => null,
}));

import { getProduct, ProductPageContent } from "./page";
import { getCachedProduct, getProductForPage } from "@/lib/product-cache";
import { TAG } from "@/lib/cache-tags";

const SLUG = "acme-hoodie";
const EXPECTED_ENTITY_TAG = "headkit:product:acme-hoodie";
const EXPECTED_INDEX_TAG = "headkit:products";

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  productsGet.mockReset();
  brandsGet.mockReset();
  withShopifyPreviewKey.mockReset();
  loggerError.mockClear();
  productDetailProps.mockClear();
  productJsonLdProps.mockClear();
  productsGet.mockResolvedValue(null);
  brandsGet.mockResolvedValue(null);
});

describe("products/[...slug] getProduct — TAG.product + days", () => {
  it("tags TAG.product(slug) + TAG.products at cacheLife('days')", async () => {
    await getProduct(SLUG);
    expect(cacheTag).toHaveBeenCalledWith(
      EXPECTED_ENTITY_TAG,
      EXPECTED_INDEX_TAG,
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});

describe("shared getCachedProduct is the single PDP cache entry", () => {
  it("page re-export and lib helper produce the IDENTICAL entity tag", async () => {
    await getProduct(SLUG);
    const pageTags = cacheTag.mock.calls[0];

    cacheTag.mockClear();
    await getCachedProduct(SLUG);
    const libTags = cacheTag.mock.calls[0];

    expect(pageTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(libTags?.[0]).toBe(EXPECTED_ENTITY_TAG);
    expect(pageTags?.[0]).toBe(libTags?.[0]);
  });
});

describe("getCachedProduct off the build phase", () => {
  it("is the per-slug SDK read — the bulk prefetch is inert without NEXT_PHASE", async () => {
    const product = { slug: SLUG };
    productsGet.mockResolvedValue(product);
    await expect(getCachedProduct(SLUG)).resolves.toBe(product);
    expect(productsGet).toHaveBeenCalledTimes(1);
    expect(productsGet).toHaveBeenCalledWith(SLUG);
  });
});

describe("getProductForPage preview bypass", () => {
  it("skips cache and forwards preview_key to the SDK", async () => {
    await getProductForPage(SLUG, { shopifyPreviewKey: "preview-secret" });
    expect(withShopifyPreviewKey).toHaveBeenCalledWith("preview-secret");
    expect(cacheTag).not.toHaveBeenCalled();
    expect(cacheLife).not.toHaveBeenCalled();
    expect(productsGet).toHaveBeenCalledWith(SLUG);
  });
});

/**
 * A provider failure inside `ProductPageContent` DEGRADES, and it must do so
 * without asking which phase it is in.
 *
 * This component renders below the PDP's `<Suspense>` boundary, so `notFound()`
 * could not set a status here even if the product really were missing — and a
 * THROWN provider read is not evidence that it is, so answering with the
 * not-found UI tells a shopper an existing product is gone. The other obvious
 * alternative is worse: an escaping throw aborts the tenant static export,
 * because this route's `generateStaticParams` enumerates REAL products (#332).
 *
 * So the degrade is unconditional, and these assertions run in ONE arrangement
 * with no environment set up. That is the design rather than a shortcut: there
 * is no phase to arrange for, and a test that had to name one to reach this
 * catch would be asserting a mechanism the route deliberately does not have.
 *
 * The degrade also has to be OBSERVABLE — a build that shipped one degraded PDP
 * must be distinguishable from a clean one by its output alone — and the line
 * it emits must stay inside the logger's caller contract, which forbids handing
 * it a raw upstream error body (threat T-09.5-07). Both are asserted below.
 */
describe("ProductPageContent provider failure", () => {
  /**
   * Shaped like the real thing: `@headkit/sdk` builds `NetworkError`'s message
   * as `HeadKit authentication failed: ${body}` on a 401, so the raw upstream
   * response text IS the message. That is what must not reach the log line.
   */
  const UPSTREAM_BODY = "consumer_key=ck_live_leaked_from_the_gateway";
  const providerFailure = (): Error =>
    Object.assign(
      new Error(`HeadKit authentication failed: ${UPSTREAM_BODY}`),
      {
        name: "NetworkError",
        code: "INVALID_KEY",
        status: 401,
      },
    );

  it("renders a degraded page instead of throwing or 404ing", async () => {
    const { ProductPageContent } = await import("./page");
    productsGet.mockRejectedValueOnce(providerFailure());

    const rendered = await ProductPageContent({
      params: Promise.resolve({ slug: [SLUG] }),
    });

    const html = renderToStaticMarkup(rendered as ReactElement);
    expect(
      html,
      "the shopper must get an honest, retryable page — not the not-found UI " +
        "for a product the gate above proved exists.",
    ).toContain("temporarily unavailable");
    expect(html, "and not the not-found UI either").not.toContain(
      "Page not found",
    );
  });

  it("logs the degrade with the slug that aims the recovery lever", async () => {
    const { ProductPageContent } = await import("./page");
    productsGet.mockRejectedValueOnce(providerFailure());

    await ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) });

    expect(
      loggerError,
      "a degraded PDP that logs nothing makes a build which shipped one " +
        "indistinguishable from a clean one.",
    ).toHaveBeenCalledTimes(1);
    const [event, fields] = loggerError.mock.calls[0]!;
    expect(event).toBe("pdp.degraded_render");
    expect(
      fields?.["productSlug"],
      "the slug is what aims `revalidateTag(TAG.product(slug))`; an alert " +
        "without it says only that something degraded somewhere.",
    ).toBe(SLUG);
  });

  it("logs a bounded discriminator, never the upstream response body", async () => {
    const { ProductPageContent } = await import("./page");
    productsGet.mockRejectedValueOnce(providerFailure());

    await ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) });

    const fields = loggerError.mock.calls[0]![1];
    expect(
      JSON.stringify(fields),
      "`lib/logger.ts` forbids callers handing it a raw error body " +
        "(T-09.5-07), and an SDK 401 puts that body in `error.message`.",
    ).not.toContain(UPSTREAM_BODY);
    expect(
      { ...fields, productSlug: undefined, recovery: undefined },
      "and it still has to tell one failure class from another.",
    ).toMatchObject({ name: "NetworkError", code: "INVALID_KEY", status: 401 });
  });

  it("never lets the failure escape, so the static export survives", async () => {
    const { ProductPageContent } = await import("./page");
    productsGet.mockRejectedValueOnce(providerFailure());

    await expect(
      ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) }),
      "an escaping error while prerendering ONE product aborts the whole " +
        "tenant export (#332). No phase check protects this — the degrade is " +
        "unconditional.",
    ).resolves.toBeDefined();
  });

  it("still re-raises Next control flow rather than degrading it", async () => {
    const { ProductPageContent } = await import("./page");
    productsGet.mockRejectedValueOnce(
      Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      }),
    );

    await expect(
      ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) }),
      "a notFound()/redirect() thrown from a nested read is control flow, not " +
        "an outage; swallowing it into the degraded page would strip its status.",
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK/);
  });
});

/**
 * A product on a store using WooCommerce's DEFAULT `/product/` permalink base:
 * no `/shop` ancestry, so the PDP takes its fallback-crumb branch. On such a
 * store that is EVERY product, which is what makes any cache tag acquired on
 * this branch a whole-catalogue liability rather than an edge case.
 */
const NO_ANCESTRY_PRODUCT = {
  id: "p1",
  name: "Acme Hoodie",
  slug: SLUG,
  uri: "https://commerce.example.com/product/acme-hoodie/",
  shortDescription: "",
  description: "",
  seo: null,
  image: null,
  attributes: [],
  defaultAttributes: [],
  variations: [],
  categories: [{ id: "c1", name: "Hoodies", slug: "hoodies" }],
  related: [],
  upsells: [],
  projects: [],
};

/**
 * DOMAIN OF THIS GUARD, and where it stops.
 *
 * It exercises the FLAT `/products/[...slug]` route only — that is the route
 * `ProductPageContent` is imported from here, and the route that is canonical
 * on a store using WooCommerce's default `/product/` permalink base.
 *
 * IT DOES NOT COVER the nested `/shop/[...slug]` route, which STILL carries
 * `TAG.collections`: its default export awaits `getShopCategoryTree()` outside
 * any enclosing `"use cache"` scope, so the tag lands on that route's entry and
 * one product save purges every canonical PDP on a nested-permalink store —
 * which is the class both cutover stores (Pebblr, Dishee) are in. That read is
 * load-bearing (the tree is what decides category-vs-product) and pre-dates
 * this branch, so it is not fixed here. Tracked as
 * `260824-nested-pdp-catalogue-purge-tag` (P1).
 *
 * Naming this describe for "the PDP route" would state something false: the
 * guard would read as a store-wide guarantee while covering one of the two
 * routes that serve a PDP.
 */
describe("the FLAT /products route does not subscribe to the whole-catalogue tag", () => {
  it("acquires no TAG.collections while rendering a product with no permalink ancestry", async () => {
    productsGet.mockResolvedValue(NO_ANCESTRY_PRODUCT);

    await ProductPageContent({ params: Promise.resolve({ slug: [SLUG] }) });

    const tags = cacheTag.mock.calls.flat();

    // Positive control: the render really happened and this spy really sees the
    // tags it acquires, so the ban below is not vacuous.
    expect(
      tags,
      "the PDP must still own its product entry — a render that acquired no tags at all would satisfy the ban below without proving anything",
    ).toContain(EXPECTED_ENTITY_TAG);

    expect(
      tags,
      "headkit:collections is fired by every product-CATEGORY term edit and lands on the home page, the sitemap, the nested /shop route and every category shell, so a PDP that subscribes to it is purged store-wide by one category edit (the tag-welding hazard in lib/cache-tags.ts). It is NOT fired by a product save — see the plural-index block in lib/wp-revalidation-events.test.ts",
    ).not.toContain(TAG.collections);
  });
});

/**
 * Display brand (Bike Society PDP gaps #5 and #28). `ProductFields` now selects
 * `brands`; the page resolves the first term, reads its logo through ONE cached
 * brand entry, hands `ProductDetail` a `brand` and names the brand — not the
 * store — in JSON-LD.
 *
 * The multi-tenant half is the one that matters: a product with NO brand terms
 * (every product on Dishee/Pebblr today, and every product read through a theme
 * that predates the selection) must produce exactly what it produced before —
 * no brand prop, store name in JSON-LD, and NO brand read at all.
 */
describe("ProductPageContent display brand", () => {
  const BRANDED_PRODUCT = {
    ...NO_ANCESTRY_PRODUCT,
    brands: [
      { id: "b2", name: "S-Works", slug: "s-works" },
      { id: "b1", name: "Specialized", slug: "specialized" },
    ],
  };

  it("resolves the FIRST brand term, fetches its logo once under TAG.brands, and names it in JSON-LD", async () => {
    productsGet.mockResolvedValue(BRANDED_PRODUCT);
    brandsGet.mockResolvedValue({
      name: "S-Works",
      slug: "s-works",
      thumbnail: "https://cms.example/S-Works.svg",
      image: null,
    });

    renderToStaticMarkup(
      (await ProductPageContent({
        params: Promise.resolve({ slug: [SLUG] }),
      })) as ReactElement,
    );

    expect(brandsGet).toHaveBeenCalledTimes(1);
    expect(brandsGet).toHaveBeenCalledWith("s-works");
    // The brand-TERM tag, not the product-SET tag. `headkit:brand:{slug}`
    // rides every product save in the brand (a stock movement included), and
    // this read is awaited by every PDP in it, so carrying the singular here
    // propagated one stock change onto every one of that brand's PDP entries.
    // `headkit:brands` fires only on a brand term create / edit / delete —
    // which is the only thing that can change this read's output. See
    // `lib/product-brand.ts` for the trade, and `lib/cache-tags.ts`, where
    // `headkit:brands` is classified WIDE so the purge invalidates rather than
    // deletes.
    expect(cacheTag).toHaveBeenCalledWith(TAG.brands);
    expect(
      cacheTag.mock.calls.flat(),
      "the product-SET tag rides every stock movement and would purge this entry from events that cannot change a brand's logo",
    ).not.toContain(TAG.brand("s-works"));

    expect(productDetailProps).toHaveBeenCalledTimes(1);
    expect(productDetailProps.mock.calls[0]![0]["brand"]).toEqual({
      name: "S-Works",
      slug: "s-works",
      logoUrl: "https://cms.example/S-Works.svg",
    });
    expect(productJsonLdProps.mock.calls[0]![0]["brandName"]).toBe("S-Works");
  });

  it("renders no brand and keeps the STORE name in JSON-LD when the product has none", async () => {
    productsGet.mockResolvedValue(NO_ANCESTRY_PRODUCT);

    renderToStaticMarkup(
      (await ProductPageContent({
        params: Promise.resolve({ slug: [SLUG] }),
      })) as ReactElement,
    );

    expect(brandsGet, "no brand terms → no brand read").not.toHaveBeenCalled();
    expect(productDetailProps.mock.calls[0]![0]["brand"]).toBeNull();
    expect(productJsonLdProps.mock.calls[0]![0]["brandName"]).toBe(
      "Test Store",
    );
  });

  it("treats a payload with no `brands` key at all (older SDK/theme) exactly like an empty list", async () => {
    const { brands: _omitted, ...withoutKey } = BRANDED_PRODUCT;
    void _omitted;
    productsGet.mockResolvedValue(withoutKey);

    renderToStaticMarkup(
      (await ProductPageContent({
        params: Promise.resolve({ slug: [SLUG] }),
      })) as ReactElement,
    );

    expect(brandsGet).not.toHaveBeenCalled();
    expect(productDetailProps.mock.calls[0]![0]["brand"]).toBeNull();
    expect(productJsonLdProps.mock.calls[0]![0]["brandName"]).toBe(
      "Test Store",
    );
  });

  it("falls back to the term name with no logo when the brand read fails — never a failed PDP", async () => {
    productsGet.mockResolvedValue(BRANDED_PRODUCT);
    brandsGet.mockRejectedValue(new Error("brand endpoint down"));

    const rendered = await ProductPageContent({
      params: Promise.resolve({ slug: [SLUG] }),
    });
    expect(rendered).toBeDefined();
    renderToStaticMarkup(rendered as ReactElement);
    expect(
      loggerError,
      "a missing logo is not an error",
    ).not.toHaveBeenCalled();
    expect(productDetailProps.mock.calls[0]![0]["brand"]).toEqual({
      name: "S-Works",
      slug: "s-works",
      logoUrl: null,
    });
    expect(productJsonLdProps.mock.calls[0]![0]["brandName"]).toBe("S-Works");
  });
});
