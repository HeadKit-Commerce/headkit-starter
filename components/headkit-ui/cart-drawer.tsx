"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShoppingBagIcon } from "@/components/icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CartItemRow } from "@/components/headkit-ui/cart-item";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { getCartAction } from "@/lib/cart-actions";
import { getFloatVal, formatPrice } from "@/lib/utils";

export function CartDrawer() {
  const { cartData, setCartData, cartOpen, toggleCart } = useCartContext();

  useEffect(() => {
    getCartAction().then((cart) => {
      if (cart) setCartData(cart);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = cartData?.items ?? [];
  const currency = cartData?.currency ?? {
    code: "USD",
    symbol: "$",
    minorUnit: 2,
  };
  const totalPrice = getFloatVal(cartData?.totals?.totalItems ?? "0");

  return (
    <Sheet open={cartOpen} onOpenChange={(open) => toggleCart(open)}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="mt-3 text-left">Your Bag</SheetTitle>
          <SheetDescription hidden />
        </SheetHeader>

        <div className="flex-1 relative">
          {items.length > 0 ? (
            <div className="absolute inset-0 space-y-5 py-10 overflow-y-auto scrollbar-hide">
              {items.map((item) => (
                <CartItemRow
                  key={item.key}
                  item={item}
                  currency={currency}
                  onCartUpdate={(cart) => setCartData(cart)}
                />
              ))}
            </div>
          ) : (
            <>
              <p className="mb-4">No products in your cart!</p>
              <p className="mb-10 font-medium">
                Have a look around our selection of products to get ready for
                your next adventure.
              </p>
              <Link href="/shop">
                <Button
                  fullWidth
                  suppressHydrationWarning
                  onClick={() => toggleCart(false)}
                >
                  Start shopping
                </Button>
              </Link>
            </>
          )}
        </div>

        <SheetFooter>
          {items.length > 0 && (
            <div className="w-full flex flex-col gap-2 mt-auto bg-white">
              <div className="flex font-medium gap-1">
                <p className="flex-1 flex items-end">
                  Shipping and tax calculated at checkout
                </p>
                <p className="flex items-end text-xl">
                  {formatPrice(totalPrice, currency.code)}
                </p>
              </div>
              <Link href="/checkout">
                <Button
                  fullWidth
                  suppressHydrationWarning
                  onClick={() => toggleCart(false)}
                  className="mt-3"
                >
                  Checkout
                </Button>
              </Link>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Standalone cart icon button that opens the CartDrawer.
 * Can be dropped anywhere inside a CartProvider.
 */
export function CartTriggerButton({
  initialCartCount = 0,
}: {
  initialCartCount?: number;
}) {
  const { cartData, toggleCart } = useCartContext();
  const count = cartData?.itemsCount ?? initialCartCount;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cart"
      className="relative h-9 w-9 justify-end pr-0"
      onClick={() => toggleCart(true)}
    >
      <ShoppingBagIcon className="h-6 w-6 stroke-purple-800 stroke-2 hover:stroke-purple-500" />
      {count > 0 && (
        <span className="absolute right-0 top-[10px] z-10 h-[14px] min-w-[14px] rounded-full bg-purple-500 text-center text-[10px] font-medium leading-[14px] text-white px-0.5">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}
