"use client";

import { cn } from "@/lib/utils";
import {
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu";
import { useCollection } from "./collection-context";
import { SortKey, SortKeyLabels, type SortKeyType } from "./utils";

export function SortMenu() {
  const { filterValues, setFilterValues } = useCollection();

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="cursor-pointer">
        Sort
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <div className="p-4 flex flex-col gap-2 items-end">
          {(Object.keys(SortKey) as SortKeyType[]).map((key) => (
            <div
              key={key}
              className={cn(
                "cursor-pointer p-2 hover:text-purple-500 flex items-center w-fit gap-x-2",
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
