import { connection } from "next/server";
import { headkit } from "@/lib/sdk";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";

interface Props {
  productSlug: string;
  colorSlug?: string;
}

/**
 * Server component that fetches lean stock data, bypassing the static PDP cache.
 * Intended to be wrapped in <Suspense> so the rest of the page remains cached.
 * Uses `products.getStock` (ENG-853) instead of the full product payload.
 */
export async function ProductStock({ productSlug, colorSlug }: Props) {
  await connection(); // opts this component into dynamic rendering

  const product = await headkit.products.getStock(productSlug);
  if (!product) return null;

  const variation = colorSlug
    ? product.variations.find((v) =>
        v.attributes.some(
          (a) =>
            (a.key === "pa_color" || a.key === "pa_colour") &&
            a.value === colorSlug,
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
}
