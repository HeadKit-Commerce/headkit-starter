import { getCachedProduct } from "@/lib/product-cache";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";
import { findSwatchAttribute } from "@/lib/swatch-attribute";

interface Props {
  productSlug: string;
  colorSlug?: string;
}

/**
 * The PDP stock line, read from the SAME `"use cache"` product entry the page
 * renders from (`getCachedProduct`), so it is prerendered inline beside the
 * price and shows with JavaScript off.
 *
 * It used to opt itself into request-time rendering — `connection()` plus an
 * uncached `products.get` — to bypass the static cache, which made it a
 * streamed island on every view (and, before the route split, part of the
 * reason the whole PDP boundary streamed). Freshness now comes from the
 * theme's tag purges instead: a stock or price save fires
 * `headkit:product:<slug>` (`docs/cache-revalidation-contract.md`), which
 * expires this entry and the page together, so the two can never disagree.
 *
 * Uses `products.get` until a lean `getStock` SDK method ships (ENG-853).
 *
 * Must never throw during post-action RSC refresh (e.g. after add-to-cart):
 * a provider outage would otherwise trip the route `error.tsx` boundary.
 */
export async function ProductStock({ productSlug, colorSlug }: Props) {
  try {
    const product = await getCachedProduct(productSlug);
    if (!product) return null;
    const swatchAttr = findSwatchAttribute(product.attributes);
    const variation = colorSlug
      ? product.variations.find((v) =>
          v.attributes.some(
            (a) =>
              a.value === colorSlug &&
              (!swatchAttr || a.key === swatchAttr.slug),
          ),
        )
      : null;

    const stockStatus =
      variation?.stockStatus ?? product.stockStatus ?? "instock";
    const stockQuantity =
      variation?.stockQuantity ?? product.stockQuantity ?? null;

    return (
      <AvailabilityStatus
        stockStatus={stockStatus}
        stockQuantity={stockQuantity}
      />
    );
  } catch {
    return null;
  }
}
