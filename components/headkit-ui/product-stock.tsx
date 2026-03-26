import { connection } from "next/server";
import { headkit } from "@/lib/sdk";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";

interface Props {
  productSlug: string;
  colorSlug?: string;
}

/**
 * Server component that fetches fresh stock data, bypassing the static cache.
 * Intended to be wrapped in <Suspense> inside a PPR-enabled page so the rest
 * of the page remains statically pre-rendered.
 */
export async function ProductStock({ productSlug, colorSlug }: Props) {
  await connection(); // opts this component into dynamic rendering

  const product = await headkit.products.get(productSlug);
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
