import { connection } from "next/server";
import { headkit } from "@/lib/sdk";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";
import { findSwatchAttribute } from "@/lib/swatch-attribute";

interface Props {
  productSlug: string;
  colorSlug?: string;
}

/**
 * Server component that fetches fresh stock data, bypassing the static cache.
 * Intended to be wrapped in <Suspense> inside a PPR-enabled page so the rest
 * of the page remains statically pre-rendered.
 *
 * Uses `products.get` until a lean `getStock` SDK method ships (ENG-853).
 *
 * Must never throw during post-action RSC refresh (e.g. after add-to-cart):
 * a provider outage would otherwise trip the route `error.tsx` boundary.
 */
export async function ProductStock({ productSlug, colorSlug }: Props) {
  try {
    await connection(); // opts this component into dynamic rendering

    const product = await headkit.products.get(productSlug);
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
