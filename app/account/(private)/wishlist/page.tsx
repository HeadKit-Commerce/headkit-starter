"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { headkit } from "@/lib/sdk";
import {
  getWishlistEntries,
  removeFromWishlist,
  type WishlistEntry,
} from "@/lib/wishlist";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

export default function Page() {
  const [products, setProducts] = useState<ProductSummaryFieldsFragment[]>([]);
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wishlist = getWishlistEntries();
    setEntries(wishlist);
    if (wishlist.length === 0) {
      setLoading(false);
      return;
    }
    // Fetch by slug — ProductListFilter has no include/ids field.
    Promise.all(wishlist.map((entry) => headkit.products.get(entry.slug)))
      .then((results) => {
        const found = results.filter(
          (p): p is NonNullable<typeof p> => p !== null,
        );
        setProducts(found as ProductSummaryFieldsFragment[]);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = (id: string) => {
    const next = removeFromWishlist(id);
    setEntries(next);
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
            {entries.length > 0
              ? " Saved items could not be loaded — try adding them again from a product page."
              : null}
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
            <ProductCard product={product} />
            <button
              type="button"
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
