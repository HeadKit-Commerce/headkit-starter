"use client";

import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { ProductCardSkeleton } from "@/components/headkit-ui/skeletons/product-card-skeleton";
import { useChromeIcons } from "@/components/branding/branding-icons-provider";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { searchProducts } from "@/lib/search-actions";

interface SearchDrawerProps {
  /** Custom trigger element. If not provided, uses default search icon button. */
  trigger?: ReactNode;
}

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function SearchDrawer({ trigger }: SearchDrawerProps) {
  const router = useRouter();
  const { Search } = useChromeIcons();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<ProductSummaryFieldsFragment[]>([]);

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setProducts([]);
        return;
      }
      setIsLoading(true);
      try {
        const products = await searchProducts(q, 4);
        setProducts(products);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 350),
    [],
  );

  const handleChange = (value: string) => {
    setQuery(value);
    doSearch(value);
  };

  const handleViewMore = () => {
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query)}`);
    setOpen(false);
  };

  const defaultTrigger = (
    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Search">
      <Search className="h-6 w-6 text-primary transition-opacity hover:opacity-70" />
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger ?? defaultTrigger}</SheetTrigger>

      <SheetContent side="top" className="w-full">
        <SheetTitle className="sr-only">Search products</SheetTitle>
        <SheetDescription className="sr-only">Search products</SheetDescription>

        <div className="flex flex-col gap-8 py-4">
          <div className="flex justify-center">
            <div className="flex items-center gap-2 max-w-xl w-full">
              <Input
                placeholder="Search products…"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {products.map((p) => (
                  <div key={p.id} onClick={() => setOpen(false)}>
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
              <Button onClick={handleViewMore} className="mx-auto mt-2 block">
                View more results
              </Button>
            </>
          ) : query.trim() ? (
            <p className="text-center text-muted-foreground">
              No products found for &ldquo;{query}&rdquo;
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
