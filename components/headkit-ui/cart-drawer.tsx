"use client";

import { useEffect } from "react";
import Link from "next/link";
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
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { useChromeIcons } from "@/components/branding/branding-icons-provider";
import { useIsQuoteMode } from "@/components/checkout/checkout-mode-provider";
import { getCartAction } from "@/lib/cart-actions";
import { hostedCheckoutUrl, isHostedCheckoutHref } from "@/lib/hosted-checkout";
import { formatPrice, getStoreCurrency } from "@/lib/utils";
import { cartItemsDisplayTotal } from "@/lib/cart-prices";
import { PlusIcon } from "@/components/icon";

export function CartDrawer() {
  const { cartData, optimisticCart, setCartData, cartOpen, toggleCart } =
    useCartContext();
  const isQuoteMode = useIsQuoteMode();

  useEffect(() => {
    getCartAction().then((cart) => {
      if (cart) setCartData(cart);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayCart = optimisticCart ?? cartData;
  const items = displayCart?.items ?? [];
  const currency = displayCart?.currency ?? {
    code: getStoreCurrency(),
    symbol: "$",
    minorUnit: 2,
  };
  const totalPrice = cartItemsDisplayTotal(displayCart);
  // Shopify: leave HeadKit entirely — do not route through /checkout (skeleton
  // + blank redirect flash). WooCommerce keeps the internal Stripe checkout.
  const hostedCheckout = isQuoteMode ? null : hostedCheckoutUrl(displayCart);
  const checkoutHref = isQuoteMode ? "/quote" : (hostedCheckout ?? "/checkout");
  const checkoutIsExternal = isHostedCheckoutHref(checkoutHref);

  return (
    <Sheet open={cartOpen} onOpenChange={(open) => toggleCart(open)}>
      <SheetContent className="headkit-cart-drawer flex flex-col bg-brand-bg">
        <SheetHeader>
          <SheetTitle className="mt-3 text-left">
            {isQuoteMode ? "My Quote" : "Your Bag"}
          </SheetTitle>
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
              <p className="mb-4">
                {isQuoteMode
                  ? "No products in your quote yet."
                  : "No products in your cart!"}
              </p>
              <p className="mb-8 font-medium">
                {isQuoteMode ? (
                  <>
                    Browse our selection and add products to request pricing. If
                    you&apos;re not ready to build your quote please{" "}
                    <Link
                      href="/contact"
                      className="underline underline-offset-2 hover:opacity-80"
                      onClick={() => toggleCart(false)}
                    >
                      contact us
                    </Link>{" "}
                    instead.
                  </>
                ) : (
                  "Have a look around our selection of products to get ready for your next adventure."
                )}
              </p>
              <InstantLink href="/shop" pendingVariant="text">
                <Button
                  fullWidth
                  suppressHydrationWarning
                  className="shadow-none focus-visible:ring-0"
                  onClick={() => toggleCart(false)}
                >
                  {isQuoteMode ? "Browse collections" : "Start shopping"}
                </Button>
              </InstantLink>
            </>
          )}
        </div>

        <SheetFooter>
          {items.length > 0 && (
            <div className="w-full flex flex-col gap-2 mt-auto bg-brand-bg">
              {!isQuoteMode && (
                <div className="flex font-medium gap-1">
                  <p className="flex-1 flex items-end">
                    Shipping calculated at checkout
                  </p>
                  <p className="flex items-end text-xl">
                    {formatPrice(totalPrice, currency.code)}
                  </p>
                </div>
              )}
              {checkoutIsExternal ? (
                <a href={checkoutHref} rel="noopener noreferrer">
                  <Button
                    fullWidth
                    suppressHydrationWarning
                    onClick={() => toggleCart(false)}
                    className="mt-3 shadow-none focus-visible:ring-0"
                  >
                    Checkout
                  </Button>
                </a>
              ) : (
                <Link href={checkoutHref}>
                  <Button
                    fullWidth
                    suppressHydrationWarning
                    onClick={() => toggleCart(false)}
                    className="mt-3 shadow-none focus-visible:ring-0"
                    {...(isQuoteMode ? { rightIcon: "plus" as const } : {})}
                  >
                    {isQuoteMode ? "Review Quote" : "Checkout"}
                  </Button>
                </Link>
              )}
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
 * In quote mode, renders a "My Quote" CTA with a plus icon.
 */
export function CartTriggerButton({
  initialCartCount = 0,
}: {
  initialCartCount?: number;
}) {
  const { cartData, optimisticCart, toggleCart } = useCartContext();
  const { Cart } = useChromeIcons();
  const isQuoteMode = useIsQuoteMode();
  const count = (optimisticCart ?? cartData)?.itemsCount ?? initialCartCount;

  if (isQuoteMode) {
    return (
      <Button
        variant="default"
        size="sm"
        aria-label="My Quote"
        className="relative h-9 gap-1.5 pl-[10px] pr-3"
        onClick={() => toggleCart(true)}
      >
        <span>My Quote</span>
        <PlusIcon className="h-4 w-4" />
        {count > 0 && (
          <span className="headkit-badge-cart absolute -right-1 -top-1 z-10 h-[14px] min-w-[14px] rounded-full bg-brand-bg text-center text-[10px] font-medium leading-[14px] text-primary px-0.5">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cart"
      className="relative h-9 w-9 justify-end pr-0"
      onClick={() => toggleCart(true)}
    >
      <Cart className="h-6 w-6 text-primary transition-opacity hover:opacity-70" />
      {count > 0 && (
        <span className="headkit-badge-cart absolute right-0 top-[10px] z-10 h-[14px] min-w-[14px] rounded-full bg-primary text-center text-[10px] font-medium leading-[14px] text-white px-0.5">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}
