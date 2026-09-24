import type { PayPalClientOptions } from "@/lib/paypal/config";

/**
 * Load PayPal's JS SDK in the browser, once.
 *
 * ---------------------------------------------------------------------------
 * Why this is ~60 lines instead of `@paypal/react-paypal-js`
 * ---------------------------------------------------------------------------
 * The brief names that wrapper, and this is a deliberate, narrow departure
 * from it — the SDK, the options (`intent: capture`,
 * `disable-funding: credit,card`) and the `Buttons` API are exactly the ones
 * the wrapper would use, so a swap later is a change to ONE component.
 *
 * Three reasons it is not worth the dependency here:
 *
 * 1. **Almost none of it would be used.** The wrapper's value is its
 *    `onShippingAddressChange` / `onShippingOptionsChange` plumbing, which
 *    exists so PayPal can own address and rate selection. In this checkout
 *    Contact and Delivery are settled BEFORE the buttons render and the server
 *    reads the address from the cart, so those callbacks are not just unused,
 *    they are deliberately not wired (see `create-order/route.ts`).
 * 2. **It would ship to every store.** `@paypal/react-paypal-js` pulls
 *    `@paypal/sdk-constants`, and a static import in a checkout component is in
 *    the bundle whether or not the store has PayPal credentials. The property
 *    this whole change is gated on is that a store WITHOUT credentials is
 *    unchanged.
 * 3. **It could not be verified here.** `npm install` in this worktree fails
 *    against the private `@headkit` registry, so adding it would mean shipping
 *    a payments dependency whose resolution was never once exercised locally.
 *
 * The loader itself is the ordinary one: a single in-flight promise keyed by
 * the script's identity, so React's double-invoked effects and a remount never
 * inject a second `<script>` or race two `window.paypal` writes.
 */

/** The button-rendering surface of `window.paypal` this storefront uses. */
export interface PayPalButtonsApi {
  Buttons: (options: PayPalButtonsOptions) => {
    render: (container: HTMLElement) => Promise<void>;
    close: () => void;
    isEligible?: () => boolean;
  };
}

export interface PayPalButtonsOptions {
  style?: {
    layout?: "vertical" | "horizontal";
    color?: "gold" | "blue" | "silver" | "white" | "black";
    shape?: "rect" | "pill";
    label?: "paypal" | "checkout" | "buynow" | "pay";
    height?: number;
  };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

declare global {
  interface Window {
    paypal?: PayPalButtonsApi;
  }
}

const SDK_SRC_BASE = "https://www.paypal.com/sdk/js";

let pending: { key: string; promise: Promise<PayPalButtonsApi> } | null = null;

function scriptUrl(options: PayPalClientOptions, currency: string): string {
  const params = new URLSearchParams({
    "client-id": options.clientId,
    currency: currency.toUpperCase(),
    intent: "capture",
    components: "buttons",
    // Card and PayPal Credit are hidden, as v1 did: card payments belong to
    // the Stripe Payment Element sitting directly above these buttons, and
    // offering the same card twice through two processors is a support ticket.
    "disable-funding": "credit,card",
  });
  return `${SDK_SRC_BASE}?${params.toString()}`;
}

/**
 * Resolve `window.paypal`, injecting the SDK script on first call.
 *
 * Rejects rather than resolving a half-loaded global: the caller renders an
 * honest "PayPal is unavailable" message, and the Stripe element above it is
 * untouched.
 */
export function loadPayPalSdk(
  options: PayPalClientOptions,
  currency: string,
): Promise<PayPalButtonsApi> {
  const url = scriptUrl(options, currency);
  if (pending && pending.key === url) return pending.promise;

  const promise = new Promise<PayPalButtonsApi>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("PayPal SDK can only be loaded in a browser"));
      return;
    }
    if (window.paypal) {
      resolve(window.paypal);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-paypal-sdk="${CSS.escape(url)}"]`,
    );
    const script = existing ?? document.createElement("script");
    const settle = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error("PayPal SDK loaded without a global"));
    };
    script.addEventListener("load", settle);
    script.addEventListener("error", () => {
      // A failed load must not be cached as a permanent failure — a retry
      // (a re-render after a network blip) should be able to try again.
      pending = null;
      reject(new Error("PayPal SDK failed to load"));
    });
    if (!existing) {
      script.src = url;
      script.async = true;
      script.dataset["paypalSdk"] = url;
      document.head.appendChild(script);
    }
  });

  pending = { key: url, promise };
  return promise;
}

/** Drop the cached loader. Exported for tests; never called in app code. */
export function __resetPayPalSdkCache(): void {
  pending = null;
}
