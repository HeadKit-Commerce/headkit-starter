"use client";

import { useEffect, useRef } from "react";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { getCartAction } from "@/lib/cart-actions";
import {
  HOSTED_CART_SYNC_DELAY_MS,
  HOSTED_CART_SYNC_RETRIES,
  clearHostedCheckoutPending,
  isHostedCheckoutPending,
  shouldClearHostedCheckoutPending,
} from "@/lib/hosted-cart-sync";

/**
 * Silent bag refresh after Shopify Checkout. Renders nothing — the shopper
 * already saw Shopify's confirmation. Runs on tab focus / pageshow so closing
 * the Checkout window still clears HeadKit once ORDERS_PAID lands.
 */
export function HostedCartSync(): null {
  const { setCartData } = useCartContext();
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stopTimer = (): void => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const sync = async (): Promise<void> => {
      if (!isHostedCheckoutPending()) {
        return;
      }
      const cart = await getCartAction();
      if (cart) {
        setCartData(cart);
      }
      if (shouldClearHostedCheckoutPending(cart)) {
        clearHostedCheckoutPending();
        attemptsRef.current = 0;
        stopTimer();
        return;
      }
      if (attemptsRef.current >= HOSTED_CART_SYNC_RETRIES) {
        return;
      }
      attemptsRef.current += 1;
      stopTimer();
      timerRef.current = setTimeout(() => {
        void sync();
      }, HOSTED_CART_SYNC_DELAY_MS);
    };

    const onWake = (): void => {
      if (document.visibilityState === "hidden") {
        return;
      }
      attemptsRef.current = 0;
      void sync();
    };

    void sync();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [setCartData]);

  return null;
}
