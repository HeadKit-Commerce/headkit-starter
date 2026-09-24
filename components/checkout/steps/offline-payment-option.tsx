"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useCheckout } from "@stripe/react-stripe-js/checkout";
import { Button } from "@/components/ui/button";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { EMPTY_CART } from "@/components/checkout/clear-cart";
import { clearCartTokenAction } from "@/lib/cart-actions";
import { placeOfflineOrderAction } from "@/app/checkout/offline-order-actions";
import type { OfflineGatewayOption } from "@/lib/offline-gateway-details";

/**
 * The OFFLINE gateways at the Payment step, as PEER ROWS of
 * Stripe's own payment-method rows — WooCommerce's `bacs` (often re-titled by
 * the merchant), `cheque` and `cod`, for any store that enables them.
 *
 * ---------------------------------------------------------------------------
 * A hook, not a component — rows and action live in different places
 * ---------------------------------------------------------------------------
 * The step draws ALL of its rows before ANY action button, and exactly one
 * action after the last row — the rule stated once in
 * `lib/payment-method-selection.ts`, and the same shape
 * `usePayPalPaymentOption` follows, for the
 * same reason. This hook returns `rows` (each gateway, in the same card
 * treatment as the rows inside Stripe's accordion, and, on the SELECTED row,
 * the merchant's own payment instructions)
 * and `action` (the "Place order" button + any error, present only once a
 * gateway is selected), for the caller to place in the step's row list and
 * shared action slot respectively.
 *
 * Both the row's label and the instructions are resolved on the SERVER and
 * passed in as data; nothing about a gateway is spelled out here, so `bacs` /
 * `cheque` / `cod` and any other offline gateway go down exactly the same
 * path. Where the two strings come from — and why they are an env var today
 * rather than a field on the cart — is stated once, in
 * `lib/offline-gateway-details.ts`.
 *
 * The instructions render as TEXT, with newlines preserved. WooCommerce lets a
 * merchant put HTML in a gateway description, and this deliberately does not
 * honour it: merchant copy reaching `dangerouslySetInnerHTML` on the checkout
 * page is not a trade worth making for a `<br>`.
 *
 * ---------------------------------------------------------------------------
 * The order is placed UNPAID, and the copy says so
 * ---------------------------------------------------------------------------
 * There is no payment session: the button says "Place order", never "Pay", and
 * the server finalizes the WooCommerce order against the chosen gateway id
 * (`app/checkout/offline-order-actions.ts`). The amount comes from the SAME
 * place Stripe's own button takes it — `useCheckout().checkout.total` — so the
 * two buttons can never disagree about what is being ordered. That is also the
 * only reason this hook touches Stripe's hook at all.
 *
 * Nothing is sent but the gateway id the shopper picked and the live Stripe
 * session id to retire. Addresses and totals stay server-side, read from the
 * cart the earlier steps already wrote.
 */

export interface UseOfflinePaymentOptionProps {
  /** The offline gateways this cart offers, server-resolved, in Woo's order. */
  gateways: readonly OfflineGatewayOption[];
  /** Which one is selected, or null while Stripe or PayPal owns the step. */
  selectedGatewayId: string | null;
  /** Disabled while another payment path is running, so only one can run. */
  disabled?: boolean;
  /** Live Stripe Checkout Session to retire once the order is placed. */
  stripeSessionId?: string | undefined;
  /** Raised when the shopper picks one of these rows. */
  onSelect?: (gatewayId: string) => void;
  /** Raised while the place-order call is in flight, so the step can lock. */
  onBusyChange?: (busy: boolean) => void;
}

export interface OfflinePaymentOptionResult {
  /** Every offered gateway row — null when the cart offers none. */
  rows: JSX.Element | null;
  /** The "Place order" button + error — present only once one is selected. */
  action: JSX.Element | null;
}

export function useOfflinePaymentOption({
  gateways,
  selectedGatewayId,
  disabled = false,
  stripeSessionId,
  onSelect,
  onBusyChange,
}: UseOfflinePaymentOptionProps): OfflinePaymentOptionResult {
  const router = useRouter();
  const checkoutState = useCheckout();
  const { setCartData, toggleCart } = useCartContext();
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    onBusyChangeRef.current?.(isPlacing);
  }, [isPlacing]);

  const selected =
    gateways.find((gateway) => gateway.id === selectedGatewayId) ?? null;

  const placeOrder = useCallback(async () => {
    if (!selected) return;
    setIsPlacing(true);
    setError(null);
    try {
      const order = await placeOfflineOrderAction(selected.id, stripeSessionId);

      // The cart has been consumed by the finalize. Clear the UI copy and
      // rotate the token so a refetch cannot resurrect the old session — the
      // same close-out the card and PayPal paths do.
      setCartData(EMPTY_CART);
      void clearCartTokenAction().catch(() => {});
      toggleCart(false);

      router.push(
        `/checkout/success/${encodeURIComponent(
          order.orderId,
        )}?key=${encodeURIComponent(order.orderKey)}`,
      );
    } catch (err) {
      setIsPlacing(false);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not place your order. Please try again.",
      );
    }
  }, [selected, stripeSessionId, router, setCartData, toggleCart]);

  if (gateways.length === 0) return { rows: null, action: null };

  const rowDisabled = disabled || isPlacing;
  const payAmount =
    checkoutState.type === "success"
      ? checkoutState.checkout.total.total.amount.trim() || null
      : null;

  const rows = (
    <>
      {gateways.map((gateway) => {
        const isSelected = gateway.id === selectedGatewayId;
        return (
          <div key={gateway.id}>
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={rowDisabled}
              onClick={() => {
                if (!rowDisabled) onSelect?.(gateway.id);
              }}
              data-selected={isSelected ? "true" : "false"}
              data-gateway={gateway.id}
              className={`headkit-payment-method-row ${
                rowDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            >
              <span
                className="headkit-payment-method-radio"
                aria-hidden="true"
              />
              <span className="headkit-payment-method-label">
                {gateway.title}
              </span>
            </button>
            {isSelected && gateway.description && (
              <p className="headkit-offline-instructions">
                {gateway.description}
              </p>
            )}
          </div>
        );
      })}
    </>
  );

  const action = selected ? (
    <div className="headkit-offline-action space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <Button
        type="button"
        onClick={() => void placeOrder()}
        disabled={isPlacing}
        loading={isPlacing}
        className="w-full"
      >
        {payAmount ? `Place order ${payAmount}` : "Place order"}
      </Button>
    </div>
  ) : null;

  return { rows, action };
}
