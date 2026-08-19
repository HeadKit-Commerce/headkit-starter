import { getProductForPage } from "@/lib/product-cache";

/** Internal commerce slug prefix for Shopify Admin preview product IDs (shpxid). */
export const SHOPIFY_PREVIEW_SLUG_PREFIX = "__shopify_preview__:";

export function shopifyPreviewKeyFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = searchParams?.preview_key;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw;
  }
  return undefined;
}

export function shopifyProductIdFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = searchParams?.shpxid;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  return undefined;
}

/**
 * Resolve Shopify Admin preview landing URLs to the canonical headless PDP path.
 * Returns `/products/{handle}?preview_key=…` or null when the product cannot load.
 */
export async function resolveShopifyPreviewProductPath(
  previewKey: string,
  shopifyProductId: string | undefined,
): Promise<string | null> {
  if (!shopifyProductId) {
    return null;
  }

  const product = await getProductForPage(
    `${SHOPIFY_PREVIEW_SLUG_PREFIX}${shopifyProductId}`,
    { shopifyPreviewKey: previewKey },
  );
  if (!product?.slug) {
    return null;
  }

  const params = new URLSearchParams({ preview_key: previewKey });
  return `/products/${encodeURIComponent(product.slug)}?${params.toString()}`;
}
