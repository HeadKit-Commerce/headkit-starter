"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useCollection } from "./collection-context";
import { SortKey, SortKeyLabels, type SortKeyType } from "./utils";

export function SortMenu() {
  const { filterValues, setFilterValues } = useCollection();

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="cursor-pointer">
        Sort
      </NavigationMenuTrigger>
      <NavigationMenuContent className="w-screen! rounded-none!">
        <div className="p-4 flex flex-col gap-2 items-end">
          {(Object.keys(SortKey) as SortKeyType[]).map((key) => (
            <div
              key={key}
              className={cn(
                "cursor-pointer p-2 hover:text-primary flex items-center w-fit gap-x-2",
                filterValues.sort === key && "font-bold",
              )}
              onClick={() => setFilterValues({ ...filterValues, sort: key })}
            >
              {SortKeyLabels[key]}
            </div>
          ))}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

/**
 * Mobile sort dropdown (ENG-778). Popover-based so the card anchors under the
 * trigger and stays on-screen — the NavigationMenu variant rendered a
 * w-screen panel offset to the trigger's x-position (off the right edge,
 * transparent background) on mobile.
 */
export function MobileSortMenu() {
  const { filterValues, setFilterValues } = useCollection();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={navigationMenuTriggerStyle()}>
          Sort
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col">
          {(Object.keys(SortKey) as SortKeyType[]).map((key) => (
            <button
              key={key}
              type="button"
              className={cn(
                "w-full cursor-pointer px-2 py-2 text-left text-sm hover:text-primary",
                filterValues.sort === key && "font-bold",
              )}
              onClick={() => {
                setFilterValues({ ...filterValues, sort: key });
                setOpen(false);
              }}
            >
              {SortKeyLabels[key]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
