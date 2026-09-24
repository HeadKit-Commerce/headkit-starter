"use client";

import { cn, decodeHtmlEntities } from "@/lib/utils";
import { useCollection } from "./collection-context";
import { FACET_DRAWER_GRID_CLASS } from "./facet-panel";

interface CategoryFilterProps {
  categories: { slug: string; name: string }[];
  /**
   * Grid class for the option list. Defaults to the mobile drawer's two
   * columns; the desktop dropdown passes the wider ladder from
   * `facet-panel.ts`.
   */
  gridClassName?: string;
}

export function CategoryFilter({
  categories,
  gridClassName = FACET_DRAWER_GRID_CLASS,
}: CategoryFilterProps) {
  const { filterValues, setFilterValues } = useCollection();

  return (
    <div className={gridClassName}>
      {categories.map((cat) => {
        const isSelected = filterValues.categories.includes(cat.slug);
        return (
          <label
            key={cat.slug}
            // `relative` is load-bearing, not decoration: the checkbox is `sr-only`,
            // which is `position: absolute`, so without a positioned ancestor its
            // containing block is the Radix menu viewport OUTSIDE the panel's scroll
            // container. Focusing it then scrolls the PAGE instead of the list
            // (measured: tabbing to the last category moved window.scrollY 1200 to
            // 1511 and took the panel off screen, while the container's scrollTop
            // stayed 0). Making the label the containing block puts the focus target
            // inside the scroller.
            className="relative flex items-center space-x-2 cursor-pointer"
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
              {decodeHtmlEntities(cat.name)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
