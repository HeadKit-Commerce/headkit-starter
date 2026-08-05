"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { headkit } from "@/lib/sdk";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

const STORAGE_KEY = "hk_wishlist";

function getWishlistIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function removeFromWishlist(id: string) {
  const list = getWishlistIds().filter((i) => i !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function Page() {
  const [products, setProducts] = useState<ProductSummaryFieldsFragment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = getWishlistIds();
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    headkit.collections
      .list(
        { include: ids } as Parameters<typeof headkit.collections.list>[0],
        1,
        ids.length,
      )
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = (id: string) => {
    removeFromWishlist(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-500 py-8">
            Your wishlist is currently empty.
          </p>
          <Button asChild>
            <Link href="/shop">Start Shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div key={product.id} className="relative">
            {/* Follows this page's h1 directly — see ProductCard#titleAs. */}
            <ProductCard product={product} titleAs="h2" />
            <button
              onClick={() => handleRemove(product.id)}
              aria-label="Remove from wishlist"
              className="absolute top-2 right-2 cursor-pointer rounded-full bg-white p-2 shadow hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
