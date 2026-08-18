"use client";

import { useEffect } from "react";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { clearCartTokenAction } from "@/lib/cart-actions";
import type { CartFieldsFragment } from "@headkit/sdk";

/** Minimal empty cart shape used when the server cart is unavailable after checkout. */
export const EMPTY_CART: CartFieldsFragment = {
  __typename: "Cart",
  token: "",
  itemsCount: 0,
  needsPayment: false,
  needsShipping: false,
  paymentMethods: [],
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
 * Clears the cart in the UI after successful checkout / quote submit.
 *
 * Rotates the cart-token cookie so a subsequent fetch cannot restore the
 * pre-checkout session (Store API $0 / quote paths do not always empty the
 * Woo session the GraphQL cart token still points at).
 */
export function ClearCart(): null {
  const { setCartData } = useCartContext();

  useEffect(() => {
    setCartData(EMPTY_CART);
    void clearCartTokenAction()
      .then(() => {
        setCartData(EMPTY_CART);
      })
      .catch(() => {
        setCartData(EMPTY_CART);
      });
  }, [setCartData]);

  return null;
}
