/**
 * Client-side wishlist stored in localStorage (`hk_wishlist`).
 *
 * Entries keep both `id` (for remove/toggle) and `slug` (for product fetch —
 * ProductListFilter has no `include` field, so the wishlist page loads via
 * `products.get(slug)`).
 */

export const WISHLIST_STORAGE_KEY = "hk_wishlist";

export interface WishlistEntry {
  id: string;
  slug: string;
}

function isEntry(value: unknown): value is WishlistEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.slug === "string";
}

/** Read wishlist entries. Legacy bare-id arrays are ignored (cannot fetch by id). */
export function getWishlistEntries(): WishlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(
      localStorage.getItem(WISHLIST_STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isEntry);
  } catch {
    return [];
  }
}

export function isInWishlist(productId: string): boolean {
  return getWishlistEntries().some((entry) => entry.id === productId);
}

export function addToWishlist(entry: WishlistEntry): WishlistEntry[] {
  const next = [
    ...getWishlistEntries().filter((e) => e.id !== entry.id),
    entry,
  ];
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeFromWishlist(productId: string): WishlistEntry[] {
  const next = getWishlistEntries().filter((e) => e.id !== productId);
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function toggleWishlist(entry: WishlistEntry): {
  entries: WishlistEntry[];
  added: boolean;
} {
  if (isInWishlist(entry.id)) {
    return { entries: removeFromWishlist(entry.id), added: false };
  }
  return { entries: addToWishlist(entry), added: true };
}
