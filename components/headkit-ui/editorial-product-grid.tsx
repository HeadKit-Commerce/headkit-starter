"use client";

import type { Product } from "@headkit/sdk";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/headkit-ui/product-card";
import {
  collapseCatalogProducts,
  type ColourwayPins,
} from "@/lib/catalog-display";

interface Props {
  /** Products resolved (by slug) from a WordPress handpicked-products block. */
  products: Product[];
  /** Column count from WP's `has-N-columns` class (desktop). Defaults to 3. */
  columns?: number;
  /** Optional admin pins: product ID → colourway slug. */
  colourwayPins?: ColourwayPins | null | undefined;
}

// Literal class strings so Tailwind's scanner keeps them (no dynamic names).
const LG_COLS: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

/**
 * Renders a WordPress handpicked-products carousel using the storefront's own
 * ProductCard — the same component the home page uses — so editorial product
 * cards match the rest of the site (real PDP links, next/image, live prices,
 * sale badges, colour swatches) instead of WordPress's static thumbnail grid.
 *
 * Injected by EditorialContent, which resolves the block's product slugs to
 * full Product objects via the SDK and swaps this in for the `.wc-block-grid`
 * node (see editorial-content.tsx). Always one colourway per product.
 */
export function EditorialProductGrid({
  products,
  columns = 3,
  colourwayPins,
}: Props): React.JSX.Element | null {
  const catalogProducts = collapseCatalogProducts(products, colourwayPins);

  if (!catalogProducts.length) return null;

  return (
    <div
      className={cn(
        // not-prose: this grid renders inside EditorialContent's `.prose`
        // wrapper — opt out so Tailwind Typography doesn't bleed into ProductCard
        // (img top-margin, h3 margin, underlined links) and it matches the home
        // page card exactly.
        "not-prose grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10",
        LG_COLS[columns] ?? LG_COLS[3],
      )}
    >
      {catalogProducts.map((product) => (
        <ProductCard
          key={product.id || product.slug}
          product={product}
          isNew={product.isNew ?? false}
        />
      ))}
    </div>
  );
}
