"use client";

import { useEffect, useState } from "react";
import type { BrandSummary } from "@headkit/sdk";
import { cn } from "@/lib/utils";
import { listFilterBrands } from "@/lib/collection-actions";
import { useCollection } from "./collection-context";

/**
 * Brand facet (multi-select, URL-synced via collection-context `brands[]`).
 *
 * Brand options are NOT part of `ProductFilters` — they come from
 * `headkit.brands.list()` (commerce BrandsDomain). The UI/URL carry a
 * multi-select array (D-02); per Open Q1 = single-ok, only the first selected
 * brand maps to the backend `ProductListFilter.brand` (see utils.ts).
 */
export function BrandFilter() {
  const { filterValues, setFilterValues } = useCollection();
  const [brands, setBrands] = useState<BrandSummary[]>([]);

  useEffect(() => {
    let active = true;
    void listFilterBrands()
      .then((next) => {
        if (active) setBrands(next);
      })
      .catch(() => {
        // Non-fatal: brand facet simply renders empty if the list fails.
      });
    return () => {
      active = false;
    };
  }, []);

  if (brands.length === 0) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">
        No brands available
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {brands.map((brand) => {
        const isSelected = filterValues.brands.includes(brand.slug);
        return (
          <label
            key={brand.slug}
            className="flex min-h-10 items-center space-x-2 cursor-pointer"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={isSelected}
              onChange={(e) => {
                const newBrands = e.target.checked
                  ? [...filterValues.brands, brand.slug]
                  : filterValues.brands.filter((s) => s !== brand.slug);
                setFilterValues({
                  ...filterValues,
                  brands: newBrands,
                  page: 1,
                });
              }}
            />
            <span className={cn("text-sm", isSelected && "font-bold")}>
              {brand.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}
