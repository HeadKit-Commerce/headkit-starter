import { notFound, redirect } from "next/navigation";
import {
  resolveShopifyPreviewProductPath,
  shopifyPreviewKeyFromSearchParams,
  shopifyProductIdFromSearchParams,
} from "@/lib/shopify-preview";

type Props = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | undefined;
};

/** Shopify Admin draft product preview path (`/draft-product?preview_key=…&shpxid=…`). */
export default async function ShopifyDraftProductPreviewPage({
  searchParams,
}: Props): Promise<never> {
  const params = (await searchParams) ?? {};
  const previewKey = shopifyPreviewKeyFromSearchParams(params);
  if (!previewKey) {
    notFound();
  }

  const target = await resolveShopifyPreviewProductPath(
    previewKey,
    shopifyProductIdFromSearchParams(params),
  );
  if (!target) {
    notFound();
  }

  redirect(target);
}
