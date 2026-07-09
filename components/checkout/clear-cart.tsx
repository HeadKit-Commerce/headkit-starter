"use client";

import { useEffect } from "react";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { getFullCartAction } from "@/lib/cart-actions";
import type { CartFieldsFragment } from "@headkit/sdk";

/** Minimal empty cart shape used when the server cart is unavailable after checkout. */
const EMPTY_CART: CartFieldsFragment = {
  __typename: "Cart",
  token: "",
  itemsCount: 0,
  needsPayment: false,
  needsShipping: false,
  currency: { __typename: "Currency", code: "USD", symbol: "$", minorUnit: 2 },
  items: [],
  coupons: [],
  appliedGiftCards: [],
  totals: {
    __typename: "CartTotals",
    totalItems: "0",
    totalItemsTax: "0",
    totalDiscount: "0",
    totalDiscountTax: "0",
    totalShipping: "0",
    totalShippingTax: "0",
    totalPrice: "0",
    totalTax: "0",
  },
  shippingRates: [],
};

/**
 * Clears the cart in the UI after successful checkout.
 * Fetches the fresh cart from the server (WooCommerce empties it post-checkout)
 * and updates context so the navbar badge shows 0. Falls back to empty cart if fetch fails.
 */
export function ClearCart() {
  const { setCartData } = useCartContext();

  useEffect(() => {
    getFullCartAction()
      .then((cart) => setCartData(cart ?? EMPTY_CART))
      .catch(() => setCartData(EMPTY_CART));
  }, [setCartData]);

  return null;
}
