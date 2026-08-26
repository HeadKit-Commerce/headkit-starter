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

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
  resolveStoreName: (): Promise<string> => Promise.resolve("Test Store"),
  storefrontUrl: (path: string, domain?: string | null): string =>
    `https://${domain ?? "shop.example"}${path}`,
}));

vi.mock("@/components/headkit-ui/product-detail", () => ({
  ProductDetail: (): null => null,
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
  ProductJsonLD: (): null => null,
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
  withShopifyPreviewKey.mockReset();
  loggerError.mockClear();
  productsGet.mockResolvedValue(null);
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
 * `TAG.collections`: `ShopRouteContent` awaits `getShopCategoryTree()` outside
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
      "WordPress fires headkit:collections on ANY product or category change, so a PDP that subscribes to it turns one product save into a purge of every PDP on the store (the Bike Society hazard in lib/cache-tags.ts)",
    ).not.toContain(TAG.collections);
  });
});
