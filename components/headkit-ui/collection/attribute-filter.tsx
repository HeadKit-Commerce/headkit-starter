"use client";

import { cn } from "@/lib/utils";
import { useCollection } from "./collection-context";
import { formatOptionName } from "./utils";
import type { ProductFilterAttribute } from "@headkit/sdk";

interface AttributeFilterProps {
  attribute: ProductFilterAttribute & { slug: string };
}

export function AttributeFilter({ attribute }: AttributeFilterProps) {
  const { filterValues, setFilterValues } = useCollection();
  const current = filterValues.attributes[attribute.slug] ?? [];

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
                    [attribute.slug]: newVals,
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
