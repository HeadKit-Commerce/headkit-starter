"use client";

import { useEffect, useState } from "react";
import type { Product } from "@headkit/sdk";
import { createClientSDK } from "@headkit/sdk";
import { ProductCard } from "@/components/headkit-ui/product-card";

const STORAGE_KEY = "hk-recently-viewed";
const MAX_ITEMS = 8;

interface RecentItem {
  slug: string;
  timestamp: number;
}

export function addToRecentlyViewed(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items: RecentItem[] = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    const filtered = items.filter((i) => i.slug !== slug);
    filtered.unshift({ slug, timestamp: Date.now() });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(filtered.slice(0, MAX_ITEMS)),
    );
  } catch {
    // localStorage may be unavailable
  }
}

function getRecentSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as RecentItem[];
    return items.map((i) => i.slug);
  } catch {
    return [];
  }
}

interface RecentlyViewedProps {
  currentSlug?: string;
}

export function RecentlyViewed({ currentSlug }: RecentlyViewedProps) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const slugs = getRecentSlugs().filter((s) => s !== currentSlug);
    if (slugs.length === 0) return;

    const sdk = createClientSDK();

    const load = async () => {
      const results = await Promise.allSettled(
        slugs.slice(0, 4).map((slug) => sdk.products.get(slug)),
      );
      const loaded = results
        .filter(
          (r): r is PromiseFulfilledResult<Product | null> =>
            r.status === "fulfilled" && r.value !== null,
        )
        .map((r) => r.value!);
      setProducts(loaded);
    };

    void load();
  }, [currentSlug]);

  if (products.length === 0) return null;

  return (
    <section className="py-10">
      <div className="px-5 md:px-10">
        <h2 className="mb-5 text-2xl font-semibold text-primary">
          Recently Viewed
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
