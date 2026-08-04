"use client";

import { XIcon } from "@/components/icon";
import { useCollection } from "./collection-context";
import { SortKeyLabels, formatOptionName, type SortKeyType } from "./utils";

export function ActiveFilters() {
  const { filterValues, setFilterValues, productFilter } = useCollection();

  const chips: Array<{ label: string; onRemove: () => void }> = [];

  for (const cat of filterValues.categories) {
    const category = productFilter.categories?.find((c) => c?.slug === cat);
    chips.push({
      label: category?.name ?? cat,
      onRemove: () =>
        setFilterValues({
          ...filterValues,
          categories: filterValues.categories.filter((c) => c !== cat),
          page: 1,
        }),
    });
  }

  for (const brand of filterValues.brands) {
    chips.push({
      label: brand,
      onRemove: () =>
        setFilterValues({
          ...filterValues,
          brands: filterValues.brands.filter((b) => b !== brand),
          page: 1,
        }),
    });
  }

  for (const [slug, values] of Object.entries(filterValues.attributes)) {
    if (values.length === 0) continue;
    // FilterValues keys attributes by the backend `pa_`-prefixed convention,
    // but productFilter.attributes carries the stripped SDK slug — match either.
    const strippedSlug = slug.replace(/^pa_/, "");
    const attr = productFilter.attributes?.find(
      (a) => a?.slug === slug || a?.slug === strippedSlug,
    );
    for (const val of values) {
      chips.push({
        label: `${attr?.name ?? slug}: ${formatOptionName(val)}`,
        onRemove: () => {
          const next = { ...filterValues.attributes };
          next[slug] = values.filter((v) => v !== val);
          if (next[slug]!.length === 0) delete next[slug];
          setFilterValues({ ...filterValues, attributes: next, page: 1 });
        },
      });
    }
  }

  if (filterValues.instock) {
    chips.push({
      label: "In Stock Only",
      onRemove: () =>
        setFilterValues({ ...filterValues, instock: false, page: 1 }),
    });
  }

  if (filterValues.sort) {
    chips.push({
      label: `Sort: ${SortKeyLabels[filterValues.sort as SortKeyType] ?? filterValues.sort}`,
      onRemove: () => setFilterValues({ ...filterValues, sort: "", page: 1 }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-5 pb-4 md:px-10">
      {chips.map((chip, i) => (
        <button
          key={i}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-primary/50 hover:text-primary"
        >
          <span className="truncate">{chip.label}</span>
          <XIcon className="h-3 w-3 shrink-0" />
        </button>
      ))}

      {chips.length > 1 && (
        <button
          type="button"
          onClick={() =>
            setFilterValues({
              categories: [],
              brands: [],
              attributes: {},
              instock: false,
              sort: "",
              page: 1,
            })
          }
          className="cursor-pointer text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
