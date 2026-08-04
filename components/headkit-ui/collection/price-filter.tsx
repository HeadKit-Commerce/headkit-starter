"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCollection } from "./collection-context";

/**
 * Price facet (min/max). Bounds come from `ProductFilters.minPrice/maxPrice`
 * (via collection-context `productFilter`). State is URL-synced through
 * `price_min`/`price_max` and mapped to `ProductListFilter.minPrice/maxPrice`.
 *
 * Auto-applies on commit (blur / Enter / clear) — no global Apply button (D-02).
 * Local input state debounces typing so each keystroke doesn't refetch.
 */
export function PriceFilter() {
  const { filterValues, setFilterValues, productFilter } = useCollection();

  const boundMin = productFilter.minPrice ?? "";
  const boundMax = productFilter.maxPrice ?? "";

  const [min, setMin] = useState(filterValues.price_min ?? "");
  const [max, setMax] = useState(filterValues.price_max ?? "");

  // Keep local inputs in sync when filters are cleared/changed elsewhere.
  useEffect(() => {
    setMin(filterValues.price_min ?? "");
    setMax(filterValues.price_max ?? "");
  }, [filterValues.price_min, filterValues.price_max]);

  const commit = (nextMin: string, nextMax: string) => {
    const cleanMin = nextMin.trim();
    const cleanMax = nextMax.trim();
    if (
      cleanMin === (filterValues.price_min ?? "") &&
      cleanMax === (filterValues.price_max ?? "")
    ) {
      return; // no-op — avoid a redundant refetch
    }
    setFilterValues({
      ...filterValues,
      price_min: cleanMin,
      price_max: cleanMax,
      page: 1,
    });
  };

  const clear = () => {
    setMin("");
    setMax("");
    commit("", "");
  };

  const hasValue =
    (filterValues.price_min ?? "") !== "" ||
    (filterValues.price_max ?? "") !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={boundMin || undefined}
          max={boundMax || undefined}
          placeholder={boundMin ? `Min ${boundMin}` : "Min"}
          aria-label="Minimum price"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => commit(min, max)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(min, max);
          }}
          className="h-10 w-24"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="number"
          inputMode="numeric"
          min={boundMin || undefined}
          max={boundMax || undefined}
          placeholder={boundMax ? `Max ${boundMax}` : "Max"}
          aria-label="Maximum price"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => commit(min, max)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(min, max);
          }}
          className="h-10 w-24"
        />
      </div>
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          className="h-10 self-start px-2 text-sm underline hover:text-primary"
          onClick={clear}
        >
          Clear price
        </Button>
      )}
    </div>
  );
}
