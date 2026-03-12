"use client";

import { cn } from "@/lib/utils";
import { useCollection } from "./collection-context";

interface CategoryFilterProps {
  categories: { slug: string; name: string }[];
}

export function CategoryFilter({ categories }: CategoryFilterProps) {
  const { filterValues, setFilterValues } = useCollection();

  return (
    <div className="grid grid-cols-2 gap-4">
      {categories.map((cat) => {
        const isSelected = filterValues.categories.includes(cat.slug);
        return (
          <label
            key={cat.slug}
            className="flex items-center space-x-2 cursor-pointer"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={isSelected}
              onChange={(e) => {
                const newCats = e.target.checked
                  ? [...filterValues.categories, cat.slug]
                  : filterValues.categories.filter((s) => s !== cat.slug);
                setFilterValues({
                  ...filterValues,
                  categories: newCats,
                  page: 1,
                });
              }}
            />
            <span className={cn("text-sm", isSelected && "font-bold")}>
              {cat.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}
