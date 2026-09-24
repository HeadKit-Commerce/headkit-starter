"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { PayPalIcon } from "@/components/icon";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { EMPTY_CART } from "@/components/checkout/clear-cart";
import { clearCartTokenAction } from "@/lib/cart-actions";
import {
  loadPayPalSdk,
  type PayPalButtonsApi,
} from "@/lib/paypal/script-loader";
import type { PayPalClientOptions } from "@/lib/paypal/config";

/**
 * The PayPal choice at the Payment step, as a PEER ROW of
 * Stripe's own payment-method rows rather than a block hanging underneath.
 *
 * ---------------------------------------------------------------------------
 * A hook, not a component — the row and the action live in different places
 * ---------------------------------------------------------------------------
 * The step draws ALL of its rows (Stripe's own, PayPal's, the offline
 * gateways') before ANY action button, and exactly one action after the last
 * row — the conventional multi-gateway shape, stated once in
 * `lib/payment-method-selection.ts`. PayPal's row and PayPal's buttons
 * therefore cannot be one
 * subtree rendered in one place, the way a plain component would: this is a
 * HOOK the step calls once, which returns `row` (rendered inline, where the
 * PayPal option lives in the list) and `action` (rendered by the caller in
 * the step's single shared action slot, only while `selected`). Both come out
 * of the SAME hook call, backed by the SAME `sdk` / `status` state and the
 * SAME `containerRef` — the buttons are still mounted exactly once; only
 * where the caller PLACES the two pieces of markup differs.
 *
 * `options` is the on/off switch. It is `null` on every store without PayPal
 * credentials, and the hook returns `{ row: null, action: null }` before
 * touching `loadPayPalSdk` or constructing anything — the same silence the
 * component version shipped, now expressed as "never runs" rather than
 * "never mounts" (`app/checkout/paypal-absent.test.tsx`).
 *
 * Eligibility is probed on MOUNT, not on selection: `paypal.Buttons()` can be
 * constructed and asked `isEligible()` without rendering anything, so a store
 * whose buyer cannot use PayPal shows no row at all instead of a row that
 * vanishes when clicked.
 *
 * ---------------------------------------------------------------------------
 * What this hook is NOT responsible for
 * ---------------------------------------------------------------------------
 * It sends no money figures, no addresses and no cart contents. `createOrder`
 * posts an EMPTY body and `onApprove` posts only the PayPal order id PayPal
 * itself just handed the page. Everything that decides what is charged and
 * what is shipped is read server-side from the cart
 * (`app/api/paypal/create-order`, `app/api/paypal/capture-order`). A client
 * that can name a price is a client that can choose one.
 *
 * `stripeSessionId` is the one extra value it passes: the live Stripe session
 * this shopper walked Contact and Delivery through, so the capture route can
 * retire it (`SUPERSEDED`) once the order is placed. Without that, a session
 * the shopper abandoned mid-checkout stays open on the connected account.
 *
 * ---------------------------------------------------------------------------
 * The order is placed by the CAPTURE ROUTE, not here
 * ---------------------------------------------------------------------------
 * `onApprove` makes exactly one request and gets back the WooCommerce order
 * id and key. There is no second "now place the order" call for a closing tab
 * to interrupt — the only thing left for the browser is the redirect, and if
 * even that is lost the order still exists and the confirmation email is
 * already sent.
 */

export interface UsePayPalPaymentOptionProps {
  /** Null on every store without PayPal credentials — the whole gate. */
  options: PayPalClientOptions | null;
  /** Cart currency (ISO 4217) — PayPal's SDK is loaded per currency. */
  currency: string;
  /** Live Stripe Checkout Session to retire after the order is placed. */
  stripeSessionId?: string | undefined;
  /** Disabled while the Stripe path is mid-confirm, so only one can run. */
  disabled?: boolean;
  /** True when PayPal is the step's selected method — see the reducer. */
  selected?: boolean;
  /** Raised when the shopper picks this row. */
  onSelect?: () => void;
  /** Raised while PayPal's capture is in flight, so the step can lock. */
  onBusyChange?: (busy: boolean) => void;
}

export interface PayPalPaymentOptionResult {
  /** The row (radio, mark, label) — null while off or ineligible. */
  row: JSX.Element | null;
  /** The buttons host + status/error — present only while `selected`. */
  action: JSX.Element | null;
}

type Status = "loading" | "ready" | "paying" | "unavailable";

export function usePayPalPaymentOption({
  options,
  currency,
  stripeSessionId,
  disabled = false,
  selected = false,
  onSelect,
  onBusyChange,
}: UsePayPalPaymentOptionProps): PayPalPaymentOptionResult {
  const router = useRouter();
  const { setCartData, toggleCart } = useCartContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sdk, setSdk] = useState<PayPalButtonsApi | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  // PayPal's Buttons instance captures its callbacks ONCE at construction, so
  // anything they read has to come through a ref or the buttons keep calling
  // the first render's closure for the life of the page. The refs are written
  // in an effect below, never during render.
  const stripeSessionIdRef = useRef(stripeSessionId);

  const createOrder = useCallback(async (): Promise<string> => {
    setError(null);
    const response = await fetch("/api/paypal/create-order", {
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      orderId?: string;
      error?: string;
    };
    if (!response.ok || !body.orderId) {
      throw new Error(
        body.error ?? "Could not start the PayPal payment. Please try again.",
      );
    }
    return body.orderId;
  }, []);

  const onApprove = useCallback(
    async (data: { orderID: string }): Promise<void> => {
      setStatus("paying");
      setError(null);
      const response = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: data.orderID,
          ...(stripeSessionIdRef.current
            ? { stripeSessionId: stripeSessionIdRef.current }
            : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        orderId?: string;
        orderKey?: string;
        error?: string;
        code?: string;
      };

      if (!response.ok || !body.orderId || !body.orderKey) {
        setStatus("ready");
        setError(
          body.error ??
            "Your payment could not be completed. Please try again.",
        );
        return;
      }

      // The cart has been consumed by the finalize. Clear the UI copy and
      // rotate the token so a refetch cannot resurrect the old session —
      // the same close-out the offline checkout does.
      setCartData(EMPTY_CART);
      void clearCartTokenAction().catch(() => {});
      toggleCart(false);

      router.push(
        `/checkout/success/${encodeURIComponent(
          body.orderId,
        )}?key=${encodeURIComponent(body.orderKey)}`,
      );
    },
    [router, setCartData, toggleCart],
  );

  const createOrderRef = useRef(createOrder);
  const onApproveRef = useRef(onApprove);
  const onBusyChangeRef = useRef(onBusyChange);

  // Declared BEFORE the mount effect so the refs are current by the time the
  // buttons are constructed. No dependency list: every render re-syncs them.
  useEffect(() => {
    stripeSessionIdRef.current = stripeSessionId;
    createOrderRef.current = createOrder;
    onApproveRef.current = onApprove;
    onBusyChangeRef.current = onBusyChange;
  });

  // The step's lock (`payPalBusy`) follows the capture, not the selection.
  useEffect(() => {
    onBusyChangeRef.current?.(status === "paying");
  }, [status]);

  /** The one Buttons config, used both for the eligibility probe and the
   *  real render. It reads only refs and stable setters, so it never changes
   *  identity and never re-runs the effects that depend on it. */
  const buildButtonsOptions = useCallback(
    () => ({
      style: {
        layout: "vertical" as const,
        color: "gold" as const,
        shape: "rect" as const,
        label: "pay" as const,
        height: 44,
      },
      createOrder: () => createOrderRef.current(),
      onApprove: (data: { orderID: string }) => onApproveRef.current(data),
      onCancel: () => setStatus("ready"),
      onError: () => {
        setStatus("ready");
        setError(
          "PayPal could not complete this payment. Please try again or pay by card above.",
        );
      },
    }),
    [],
  );

  // 1. Load the SDK and decide, once, whether this buyer can use PayPal at
  //    all. Constructing Buttons renders nothing; `isEligible()` is the only
  //    way to ask, and asking here is what keeps an ineligible buyer from
  //    seeing a row that disappears under the cursor. Skipped entirely while
  //    `options` is null — the store has no PayPal credentials, and nothing
  //    below this line may run (`app/checkout/paypal-absent.test.tsx`).
  useEffect(() => {
    if (!options) return;
    let cancelled = false;
    void loadPayPalSdk(options, currency)
      .then((paypal) => {
        if (cancelled) return;
        const probe = paypal.Buttons(buildButtonsOptions());
        if (probe.isEligible && !probe.isEligible()) {
          setStatus("unavailable");
          return;
        }
        setSdk(paypal);
        setStatus((current) => (current === "loading" ? "ready" : current));
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [options, currency, buildButtonsOptions]);

  // 2. Render the real buttons only while PayPal is the selected method, and
  //    tear them down on deselect — the iframe is the control, so leaving it
  //    mounted-but-hidden is what would let two payment paths run at once.
  useEffect(() => {
    if (!sdk || !selected) return;
    let cancelled = false;
    let instance: { close: () => void } | null = null;

    const container = containerRef.current;
    if (!container) return;
    const buttons = sdk.Buttons(buildButtonsOptions());
    instance = buttons;
    void buttons
      .render(container)
      .then(() => {
        if (!cancelled)
          setStatus((current) => (current === "paying" ? current : "ready"));
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
      // `close()` throws if the buttons never finished rendering; a failed
      // teardown must not take the checkout down with it.
      try {
        instance?.close();
      } catch {
        /* already gone */
      }
    };
    // `buildButtonsOptions` reads only refs, so nothing else belongs here.
  }, [sdk, selected, buildButtonsOptions]);

  if (!options || status === "unavailable") {
    // Deliberately quiet: the Stripe Payment Element above is fully usable, so
    // no credentials or a PayPal outage is a missing option, not a checkout
    // error.
    return { row: null, action: null };
  }

  const rowDisabled = disabled || status === "paying";

  const row = (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={rowDisabled}
      onClick={() => {
        if (!rowDisabled) onSelect?.();
      }}
      data-selected={selected ? "true" : "false"}
      className={`headkit-payment-method-row ${
        rowDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span className="headkit-payment-method-radio" aria-hidden="true" />
      <PayPalIcon
        aria-hidden="true"
        className="headkit-payment-method-icon h-5 w-5 shrink-0"
      />
      <span className="headkit-payment-method-label">PayPal</span>
    </button>
  );

  const action = selected ? (
    <div className="headkit-paypal-buttons space-y-3">
      <div
        ref={containerRef}
        // PayPal's own iframe is the control. Pointer-events off is how
        // the step's confirm-in-progress state reaches buttons this hook
        // does not own.
        className={rowDisabled ? "pointer-events-none opacity-50" : ""}
        aria-busy={status === "paying"}
      />
      {status === "loading" && (
        <p className="text-sm text-neutral-600">Loading PayPal…</p>
      )}
      {status === "paying" && (
        <p className="text-sm text-neutral-600">
          Completing your payment — please do not close this window.
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  ) : null;

  return { row, action };
}
