import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The catch-all resolves an empty WordPress/WooCommerce placeholder page in
 * its pre-commit gate, BEFORE the CMS read.
 *
 * `/cart` and `/my-account` are real page nodes WooCommerce publishes on every
 * store and a headless storefront has no route for, so `app/[...slug]` served
 * them as a 200 with an H1 and no body. The gate must fire without touching
 * `headkit.content.get`, and it must match the bare slug EXACTLY — a real
 * nested page under the same first segment still renders.
 *
 * The list itself, and a store's own additions to it, are
 * `lib/cms-placeholder-pages.test.ts`. This file is about the wiring.
 */

const notFound = vi.fn<() => never>(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
const redirectedTo = vi.fn<(path: string) => void>();
const contentGet = vi.fn<(slug: string, type: string) => Promise<unknown>>();

vi.mock("next/navigation", () => ({
  notFound: (): never => notFound(),
  permanentRedirect: (path: string): never => {
    redirectedTo(path);
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: (): void => {},
  cacheLife: (): void => {},
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: "pk_store",
    NEXT_PUBLIC_GRAPHQL_URL: "https://graph.example.test/graphql",
    HEADKIT_PRIVATE_KEY: "sk_store",
  },
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    content: {
      get: (slug: string, type: string): Promise<unknown> =>
        contentGet(slug, type),
    },
    posts: { getLanding: (): Promise<null> => Promise.resolve(null) },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { allowIndexing: true },
      storeSettings: { domain: null },
    }),
}));
vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({}),
  seoFallbackDescription: (): string => "",
  storefrontUrl: (path: string): string => `https://shop.example${path}`,
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/headkit-ui/cms-page-body", () => ({
  CmsPageBody: (): null => null,
}));
vi.mock("@/components/headkit-ui/editorial-content", () => ({
  EditorialContent: (): null => null,
}));

const { default: Page } = await import("./page");

function params(slug: string[]): { params: Promise<{ slug: string[] }> } {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  notFound.mockClear();
  redirectedTo.mockClear();
  contentGet.mockReset();
  contentGet.mockResolvedValue({ title: "x", content: "", seo: null });
});

describe("empty WooCommerce placeholder pages", () => {
  it("404s /cart before ever reading the CMS", async () => {
    await expect(Page(params(["cart"]))).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(contentGet).not.toHaveBeenCalled();
  });

  it("redirects /my-account to /account before ever reading the CMS", async () => {
    await expect(Page(params(["my-account"]))).rejects.toThrow(
      "REDIRECT:/account",
    );
    expect(redirectedTo).toHaveBeenCalledWith("/account");
    expect(contentGet).not.toHaveBeenCalled();
  });

  it("does not shadow a real nested page under the same bare slug", async () => {
    await Page(params(["cart", "recover"]));
    expect(notFound).not.toHaveBeenCalled();
    expect(redirectedTo).not.toHaveBeenCalled();
    expect(contentGet).toHaveBeenCalledWith("cart/recover", "PAGE");
  });

  it("leaves an ordinary page alone", async () => {
    await Page(params(["about"]));
    expect(notFound).not.toHaveBeenCalled();
    expect(redirectedTo).not.toHaveBeenCalled();
    expect(contentGet).toHaveBeenCalledWith("about", "PAGE");
  });
});
