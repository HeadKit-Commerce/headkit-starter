"use client";

import { useEffect, useState } from "react";
import type { BrandSummary } from "@headkit/sdk";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { listFilterBrands } from "@/lib/collection-actions";
import { useCollection } from "./collection-context";
import { FACET_DRAWER_GRID_CLASS } from "./facet-panel";

interface BrandFilterProps {
  /** See `CategoryFilterProps.gridClassName`. */
  gridClassName?: string;
}

/**
 * Brand facet (multi-select, URL-synced via collection-context `brands[]`).
 *
 * Brand options are NOT part of `ProductFilters` — they come from
 * `headkit.brands.list()` (commerce BrandsDomain). The UI/URL carry a
 * multi-select array (D-02); per Open Q1 = single-ok, only the first selected
 * brand maps to the backend `ProductListFilter.brand` (see utils.ts).
 */
export function BrandFilter({
  gridClassName = FACET_DRAWER_GRID_CLASS,
}: BrandFilterProps = {}) {
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
    <div className={gridClassName}>
      {brands.map((brand) => {
        const isSelected = filterValues.brands.includes(brand.slug);
        return (
          <label
            key={brand.slug}
            // `relative` is load-bearing, not decoration: the checkbox is `sr-only`,
            // which is `position: absolute`, so without a positioned ancestor its
            // containing block is the Radix menu viewport OUTSIDE the panel's scroll
            // container. Focusing it then scrolls the PAGE instead of the list
            // (measured: tabbing to the last category moved window.scrollY 1200 to
            // 1511 and took the panel off screen, while the container's scrollTop
            // stayed 0). Making the label the containing block puts the focus target
            // inside the scroller.
            className="relative flex min-h-10 items-center space-x-2 cursor-pointer"
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
              {decodeHtmlEntities(brand.name)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
