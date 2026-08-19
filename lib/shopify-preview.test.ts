import { beforeEach, describe, expect, it, vi } from "vitest";

const getProductForPage =
  vi.fn<
    (
      slug: string,
      options?: { shopifyPreviewKey?: string },
    ) => Promise<{ slug: string } | null>
  >();

vi.mock("@/lib/product-cache", () => ({
  getProductForPage: (
    slug: string,
    options?: { shopifyPreviewKey?: string },
  ): Promise<{ slug: string } | null> => getProductForPage(slug, options),
}));

import {
  SHOPIFY_PREVIEW_SLUG_PREFIX,
  resolveShopifyPreviewProductPath,
  shopifyPreviewKeyFromSearchParams,
  shopifyProductIdFromSearchParams,
} from "./shopify-preview";

beforeEach(() => {
  getProductForPage.mockReset();
});

describe("shopifyPreviewKeyFromSearchParams", () => {
  it("returns trimmed preview_key", () => {
    expect(shopifyPreviewKeyFromSearchParams({ preview_key: " secret " })).toBe(
      " secret ",
    );
  });

  it("returns undefined when preview_key is missing", () => {
    expect(shopifyPreviewKeyFromSearchParams({})).toBeUndefined();
  });
});

describe("shopifyProductIdFromSearchParams", () => {
  it("returns trimmed shpxid", () => {
    expect(shopifyProductIdFromSearchParams({ shpxid: " 12345 " })).toBe(
      "12345",
    );
  });
});

describe("resolveShopifyPreviewProductPath", () => {
  it("loads preview product by shpxid and returns canonical PDP path", async () => {
    getProductForPage.mockResolvedValue({ slug: "velvet-tee" });

    const path = await resolveShopifyPreviewProductPath(
      "preview-secret",
      "12345",
    );

    expect(getProductForPage).toHaveBeenCalledWith(
      `${SHOPIFY_PREVIEW_SLUG_PREFIX}12345`,
      { shopifyPreviewKey: "preview-secret" },
    );
    expect(path).toBe("/products/velvet-tee?preview_key=preview-secret");
  });

  it("returns null when shpxid is missing", async () => {
    await expect(
      resolveShopifyPreviewProductPath("preview-secret", undefined),
    ).resolves.toBeNull();
    expect(getProductForPage).not.toHaveBeenCalled();
  });

  it("returns null when commerce cannot resolve the preview product", async () => {
    getProductForPage.mockResolvedValue(null);
    await expect(
      resolveShopifyPreviewProductPath("preview-secret", "999"),
    ).resolves.toBeNull();
  });
});
