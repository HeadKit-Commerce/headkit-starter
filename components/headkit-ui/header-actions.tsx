"use client";

import Link from "next/link";
import {
  CheckIcon,
  HeartIcon,
  SearchIcon,
  ShoppingBagIcon,
  UserIcon,
} from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/headkit-ui/auth-context";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { SearchDrawer } from "@/components/headkit-ui/search-drawer";

interface HeaderActionsProps {
  /**
   * Cart item count pre-fetched server-side to avoid CLS on initial render.
   * The client will update it live once the cart loads.
   */
  initialCartCount?: number;
}

/**
 * Right-side header icon row: Search · Wishlist · Account · Cart
 *
 * Rendered as a client component so the cart count can hydrate reactively.
 * All icons follow the headkit-store-template purple palette.
 */
export function HeaderActions({ initialCartCount = 0 }: HeaderActionsProps) {
  const { isAuthenticated } = useAuth();
  const { cartData, toggleCart } = useCartContext();
  const cartCount = cartData?.itemsCount ?? initialCartCount;

  return (
    <div className="flex items-center">
      {/* Search */}
      <SearchDrawer
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="h-9 w-9 justify-end pr-0"
          >
            <SearchIcon className="h-6 w-6 stroke-purple-800 stroke-2 hover:stroke-purple-500" />
          </Button>
        }
      />

      {/* Wishlist */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Wishlist"
        className="h-9 w-9 justify-end pr-0"
        asChild
      >
        <Link href="/account/wishlist" aria-label="Wishlist">
          <HeartIcon className="h-6 w-6 stroke-purple-800 stroke-2 hover:stroke-purple-500" />
        </Link>
      </Button>

      {/* Account */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={isAuthenticated ? "Account (signed in)" : "Account"}
        className="relative h-9 w-9 justify-end pr-0"
        asChild
      >
        <Link
          href="/account"
          aria-label={isAuthenticated ? "Account (signed in)" : "Account"}
        >
          <UserIcon className="h-6 w-6 stroke-purple-800 stroke-2 hover:stroke-purple-500" />
          {isAuthenticated && <AccountLoggedInBadge />}
        </Link>
      </Button>

      {/* Cart */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cart"
        className="relative h-9 w-9 justify-end pr-0"
        onClick={() => toggleCart(true)}
      >
        <ShoppingBagIcon className="h-6 w-6 stroke-purple-800 stroke-2 hover:stroke-purple-500" />
        <CartBadge count={cartCount} />
      </Button>
    </div>
  );
}

/**
 * Mobile variant: Search · Wishlist · Account (Cart stays in the
 * mobile header bar trigger, not duplicated here).
 */
export function MobileHeaderActions() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex items-center gap-4">
      <SearchDrawer
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="h-9 w-9 p-0"
          >
            <SearchIcon className="h-6 w-6 stroke-purple-800 stroke-2" />
          </Button>
        }
      />

      <Link href="/account/wishlist">
        <HeartIcon className="h-6 w-6 stroke-purple-800 stroke-2" />
      </Link>

      <span className="relative">
        <Link
          href="/account"
          aria-label={isAuthenticated ? "Account (signed in)" : "Account"}
        >
          <UserIcon className="h-6 w-6 stroke-purple-800 stroke-2" />
        </Link>
        {isAuthenticated && <AccountLoggedInBadge />}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function AccountLoggedInBadge() {
  return (
    <span
      className={cn(
        "absolute right-0 top-[10px] z-10 flex h-[14px] min-w-[14px] items-center justify-center rounded-full",
        "bg-purple-500 text-white",
      )}
    >
      <CheckIcon className="h-2.5 w-2.5 stroke-[2.5]" />
    </span>
  );
}

function CartBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute right-0 top-[10px] z-10 h-[14px] min-w-[14px] rounded-full",
        "bg-purple-500 text-center text-[10px] font-medium leading-[14px] text-white px-0.5",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
