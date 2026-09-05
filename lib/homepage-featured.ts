import {
  getBlockQueryType,
  hasEditorSectionClass,
  type ProcessedEditorBlock,
} from "@/lib/process-editor-blocks";

type HomepageFeaturedBlock = Pick<ProcessedEditorBlock, "cssClasses"> & {
  attrs?: ProcessedEditorBlock["attrs"];
};

function isShopifyCatalogProduct(product: unknown): boolean {
  return (
    typeof product === "object" &&
    product !== null &&
    "id" in product &&
    typeof product.id === "string" &&
    product.id.startsWith("gid://shopify/")
  );
}

/**
 * Show the hardcoded Featured Products carousel for Shopify catalog
 * payloads only. WooCommerce merchants already pick product sections
 * from the CMS; a second hardcoded heading fails e2e P1-32.
 */
export function shouldShowHomepageFeaturedProducts(args: {
  featuredProducts: readonly unknown[] | null | undefined;
  editorBlocks: readonly HomepageFeaturedBlock[];
}): boolean {
  if (
    !args.featuredProducts ||
    args.featuredProducts.length === 0 ||
    !args.featuredProducts.some(isShopifyCatalogProduct)
  ) {
    return false;
  }
  if (
    hasEditorSectionClass([...args.editorBlocks], "headkit-product-carousel")
  ) {
    return false;
  }
  const queryTypes = new Set(
    args.editorBlocks
      .map((block) => getBlockQueryType(block as ProcessedEditorBlock))
      .filter((qt): qt is string => qt !== null),
  );
  return (
    !queryTypes.has("handpicked-products") &&
    !queryTypes.has("product-carousel")
  );
}
