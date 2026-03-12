"use client";

import { useState } from "react";
import {
  NavigationMenu,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Transition } from "@headlessui/react";
import { useCollection } from "./collection-context";
import { FilterMenuItem } from "./filter-menu-item";
import { CategoryFilter } from "./category-filter";
import { AttributeFilter } from "./attribute-filter";
import { ClearFiltersButton } from "./clear-filters-button";
import { SortMenu } from "./sort-menu";
import type { ProductFilterAttribute } from "@headkit/sdk";

export function Filter() {
  const { filterValues, productFilter, isLoading, setFilterValues } =
    useCollection();
  const [menuOpen, setMenuOpen] = useState(false);

  const categories = (productFilter.categories ?? [])
    .filter((c): c is NonNullable<typeof c> => !!c?.slug && !!c?.name)
    .map((c) => ({ slug: c!.slug, name: c!.name }));

  return (
    <>
      <Transition show={menuOpen}>
        <div
          className={cn(
            "fixed inset-0 z-9 bg-black/50 backdrop-blur-xs transition-opacity duration-300",
            menuOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden
        />
      </Transition>
      <NavigationMenu
        onValueChange={(v) => setMenuOpen(!!v)}
        className={cn(
          "sticky top-20 z-10 flex w-full items-center justify-between px-5 md:px-10",
          menuOpen ? "bg-white" : "bg-white/80 hover:bg-white backdrop-blur-xs",
        )}
      >
        <div
          className={cn("w-full transition-opacity", {
            "opacity-50 pointer-events-none": isLoading,
          })}
        >
          <div className="flex w-full items-center justify-between overflow-x-auto py-5 scrollbar-hide">
            <NavigationMenuList className="flex items-center gap-0 -ml-4">
              {categories.length > 0 && (
                <FilterMenuItem
                  label="Category"
                  count={filterValues.categories.length}
                >
                  <CategoryFilter categories={categories} />
                </FilterMenuItem>
              )}

              {(productFilter.attributes ?? []).map(
                (attr: ProductFilterAttribute | null) => {
                  if (!attr?.slug) return null;
                  return (
                    <FilterMenuItem
                      key={attr.slug}
                      label={attr.name}
                      count={filterValues.attributes[attr.slug]?.length ?? 0}
                    >
                      <AttributeFilter
                        attribute={
                          attr as ProductFilterAttribute & { slug: string }
                        }
                      />
                    </FilterMenuItem>
                  );
                },
              )}

              <div className="flex items-center gap-2 px-2">
                <Switch
                  checked={filterValues.instock}
                  onCheckedChange={(checked) =>
                    setFilterValues({
                      ...filterValues,
                      instock: checked,
                      page: 1,
                    })
                  }
                />
                <span
                  className={cn("whitespace-nowrap font-semibold", {
                    "font-bold": filterValues.instock,
                  })}
                >
                  In Stock
                </span>
              </div>

              <ClearFiltersButton />
            </NavigationMenuList>

            <NavigationMenuList className="flex items-center gap-2 -mr-4">
              <SortMenu />
            </NavigationMenuList>
          </div>
        </div>
      </NavigationMenu>
    </>
  );
}
