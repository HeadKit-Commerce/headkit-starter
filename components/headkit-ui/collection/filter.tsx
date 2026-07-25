"use client";

import { useState } from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Transition } from "@headlessui/react";
import { useCollection } from "./collection-context";
import { FilterMenuItem } from "./filter-menu-item";
import { CategoryFilter } from "./category-filter";
import { AttributeFilter } from "./attribute-filter";
import { BrandFilter } from "./brand-filter";
import { PriceFilter } from "./price-filter";
import { ClearFiltersButton } from "./clear-filters-button";
import { SortMenu, MobileSortMenu } from "./sort-menu";
import type { ProductFilterAttribute } from "@headkit/sdk";

/** Shared count of active facets — drives the mobile drawer badge. */
function useActiveFacetCount() {
  const { filterValues } = useCollection();
  return (
    filterValues.categories.length +
    filterValues.brands.length +
    Object.values(filterValues.attributes).reduce((n, a) => n + a.length, 0) +
    (filterValues.instock ? 1 : 0) +
    ((filterValues.price_min ?? "") !== "" ||
    (filterValues.price_max ?? "") !== ""
      ? 1
      : 0)
  );
}

export function Filter() {
  const { filterValues, productFilter, isLoading, setFilterValues } =
    useCollection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeCount = useActiveFacetCount();

  const categories = (productFilter.categories ?? [])
    .filter((c): c is NonNullable<typeof c> => !!c?.slug && !!c?.name)
    .map((c) => ({ slug: c!.slug, name: c!.name }));

  const attributes = (productFilter.attributes ?? []).filter(
    (attr): attr is ProductFilterAttribute & { slug: string } => !!attr?.slug,
  );

  const inStockToggle = (
    <div className="flex min-h-10 items-center gap-2 px-2">
      <Switch
        aria-label="In Stock"
        checked={filterValues.instock}
        onCheckedChange={(checked) =>
          setFilterValues({ ...filterValues, instock: checked, page: 1 })
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
  );

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

      {/* Desktop / tablet: inline facet nav (sidebar-style dropdowns) */}
      <NavigationMenu
        onValueChange={(v) => setMenuOpen(!!v)}
        className={cn(
          "sticky top-20 z-10 hidden w-full items-center justify-between px-5 md:flex md:px-10",
          menuOpen ? "bg-white" : "bg-white/80 hover:bg-white backdrop-blur-xs",
        )}
      >
        <div
          className={cn("w-full transition-opacity", {
            "opacity-50 pointer-events-none": isLoading,
          })}
        >
          <div className="flex w-full items-center justify-between overflow-x-auto py-5 pr-4 scrollbar-hide">
            <NavigationMenuList className="flex items-center gap-0 -ml-4">
              {categories.length > 0 && (
                <FilterMenuItem
                  label="Category"
                  count={filterValues.categories.length}
                >
                  <CategoryFilter categories={categories} />
                </FilterMenuItem>
              )}

              <FilterMenuItem label="Brand" count={filterValues.brands.length}>
                <BrandFilter />
              </FilterMenuItem>

              <FilterMenuItem
                label="Price"
                count={
                  (filterValues.price_min ?? "") !== "" ||
                  (filterValues.price_max ?? "") !== ""
                    ? 1
                    : 0
                }
              >
                <PriceFilter />
              </FilterMenuItem>

              {attributes.map((attr) => (
                <FilterMenuItem
                  key={attr.slug}
                  label={attr.name}
                  count={
                    (
                      filterValues.attributes[`pa_${attr.slug}`] ??
                      filterValues.attributes[attr.slug] ??
                      []
                    ).length
                  }
                >
                  <AttributeFilter attribute={attr} />
                </FilterMenuItem>
              ))}

              {/* <li> wrapper: NavigationMenuList is a <ul>, and a bare <div>
                  child fails the a11y list rule (the same toggle renders
                  without it in the mobile drawer, outside any list). */}
              <NavigationMenuItem>{inStockToggle}</NavigationMenuItem>

              <ClearFiltersButton />
            </NavigationMenuList>

            <NavigationMenuList className="flex items-center gap-2 -mr-4">
              <SortMenu />
            </NavigationMenuList>
          </div>
        </div>
      </NavigationMenu>

      {/* Mobile: facets live in a drawer (D-02) */}
      <div
        className={cn(
          "sticky top-20 z-10 flex w-full items-center justify-between gap-2 bg-white/90 px-5 py-4 backdrop-blur-xs md:hidden",
          { "opacity-50 pointer-events-none": isLoading },
        )}
      >
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="relative h-10 px-4 text-sm font-semibold"
            >
              Filters
              {activeCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-500 px-1 text-[10px] font-medium text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[88vw] max-w-sm overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-6 pb-10">
              {categories.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold">Category</h3>
                  <CategoryFilter categories={categories} />
                </section>
              )}
              <section>
                <h3 className="mb-3 text-sm font-bold">Brand</h3>
                <BrandFilter />
              </section>
              <section>
                <h3 className="mb-3 text-sm font-bold">Price</h3>
                <PriceFilter />
              </section>
              {attributes.map((attr) => (
                <section key={attr.slug}>
                  <h3 className="mb-3 text-sm font-bold">{attr.name}</h3>
                  <AttributeFilter attribute={attr} />
                </section>
              ))}
              <section>{inStockToggle}</section>
              <div className="pt-2">
                <ClearFiltersButton />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <MobileSortMenu />
      </div>
    </>
  );
}
