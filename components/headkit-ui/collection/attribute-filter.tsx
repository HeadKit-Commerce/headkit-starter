"use client";

import { cn } from "@/lib/utils";
import { useCollection } from "./collection-context";
import { formatOptionName } from "./utils";
import type { ProductFilterAttribute } from "@headkit/sdk";

interface AttributeFilterProps {
  attribute: ProductFilterAttribute & { slug: string };
}

/**
 * Resolve the canonical FilterValues key for an SDK attribute slug. The backend
 * (and decodeFilterSlug) use the `pa_`-prefixed convention (`pa_color`), but the
 * SDK getFilters() returns the prefix STRIPPED (`color`). FilterValues.attributes
 * is keyed by the backend `pa_` form so the grid filter is correct; the sidebar
 * must look up / write that same key to stay in sync (06.1 hydration fix).
 */
function attrKey(sdkSlug: string): string {
  return sdkSlug.startsWith("pa_") ? sdkSlug : `pa_${sdkSlug}`;
}

export function AttributeFilter({ attribute }: AttributeFilterProps) {
  const { filterValues, setFilterValues } = useCollection();
  const key = attrKey(attribute.slug);
  // Tolerate either keying form already present in state.
  const current =
    filterValues.attributes[key] ??
    filterValues.attributes[attribute.slug] ??
    [];

  return (
    <div className="grid grid-cols-2 gap-4">
      {attribute.options?.map((option) => {
        if (!option) return null;
        const isSelected = current.includes(option.slug);
        return (
          <label
            key={option.slug}
            className="flex items-center space-x-2 cursor-pointer"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={isSelected}
              onChange={(e) => {
                const newVals = e.target.checked
                  ? [...current, option.slug]
                  : current.filter((v) => v !== option.slug);
                setFilterValues({
                  ...filterValues,
                  attributes: {
                    ...filterValues.attributes,
                    // Drop any legacy stripped-slug entry; write the canonical
                    // `pa_`-prefixed key so backend filter + URL stay correct.
                    [attribute.slug]: [],
                    [key]: newVals,
                  },
                  page: 1,
                });
              }}
            />
            <span className={cn("text-sm", isSelected && "font-bold")}>
              {formatOptionName(option.name)}
              {option.count > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({option.count})
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
