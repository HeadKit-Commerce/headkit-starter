import "server-only";
import type {
  AddressInput,
  ProcessCheckoutOrderInput,
  ProcessCheckoutInput,
} from "@headkit/sdk";
import {
  processCheckoutAction,
  processCheckoutOrderAction,
} from "@/app/checkout/actions";
import { STRIPE_PAYMENT_METHOD } from "@/lib/payment-gateways";

/**
 * Turning a captured PayPal payment into a WooCommerce
 * order — the ONE place that mapping lives, shared by the browser path
 * (`/api/paypal/capture-order`) and the webhook fallback
 * (`/api/paypal/webhook`).
 *
 * ---------------------------------------------------------------------------
 * The capture id goes in `checkout_session_id`, and that is the whole design
 * ---------------------------------------------------------------------------
 * The card path keys EVERYTHING on `checkout_session_id`, including the
 * WordPress theme's atomic `INSERT IGNORE` claim row — the only cross-instance
 * authority on "has this payment already been finalised?". A PayPal order has
 * no Stripe session, so the PayPal CAPTURE ID is the session-equivalent key,
 * and putting it in that same slot means the existing claim row and the
 * existing duplicate-finalize rejection protect this path for free. A second
 * dedup mechanism would be a second thing to get wrong; there is only one.
 *
 * That is also what makes the browser/webhook race safe: both call this with
 * the same capture id, one wins the claim row, and the loser's rejection is
 * treated as success ({@link isAlreadyFinalizedError}).
 *
 * ---------------------------------------------------------------------------
 * The gateway id is `headkit-payments`, and the key names are a CONTRACT
 * ---------------------------------------------------------------------------
 * PayPal is not a separate WooCommerce gateway — the theme's `headkit-payments`
 * gateway carries a complete PayPal branch (`process_payment`,
 * `process_refund` → `refund-paypal`, the admin transaction row) AND the Store
 * API `payment_data` → `_paypal_*` meta mapping
 * (`integrations/wordpress/theme/inc/headkit-payment.php`, harness
 * `tests/paypal-payment-mapping-harness.php`). The key names emitted below are
 * that contract: `payment_provider`, `paypal_order_id`, `paypal_capture_id`,
 * `checkout_session_id`, `payment_mode`. Do not rename one without renaming it
 * there — a mismatch does not fail, it produces an order labelled `(Stripe)`
 * whose refund silently takes the Stripe arm.
 *
 * `payment_status` sent from here is ADVISORY. Commerce derives the authority
 * server-side per provider and fails closed — see
 * `docs/adr/005-payment-status-authority-by-provider.md` and the matching
 * section of the root `AGENTS.md` before touching either side.
 */

export const PAYPAL_PAYMENT_PROVIDER = "paypal";

export interface PayPalPaymentFacts {
  /** PayPal Orders v2 order id. */
  paypalOrderId: string;
  /** PayPal capture id — also the `checkout_session_id` claim key. */
  paypalCaptureId: string;
  /** `live` or `test`, matching the theme's `_headkit_payment_mode`. */
  paymentMode: "live" | "test";
}

export interface PayPalFinalizeInput {
  /** WooCommerce cart token the order is finalised against. */
  cartToken: string;
  /** Draft order id, or null when WooCommerce deferred its creation. */
  orderId: string | null;
  /** Draft order key, or null alongside a null orderId. */
  orderKey: string | null;
  billingAddress: AddressInput;
  shippingAddress: AddressInput;
  billingEmail: string | undefined;
  payment: PayPalPaymentFacts;
  /**
   * Whether this caller may CREATE the WooCommerce order when no draft exists.
   *
   * Both callers pass true, for the same reason: WooCommerce 10.8+ defers the
   * draft order to `POST /checkout`, so on such a store there is NEVER a draft
   * to adopt and a false here means no order at all. The flag stays because
   * "may this path mint an order?" is worth stating at each call site, and
   * because a store on an older WooCommerce still reaches the adopt branch.
   *
   * What keeps the webhook from minting a SECOND order is not this flag — it
   * is the capture-id claim key below, plus the webhook's own pre-write check
   * that the cart still holds items (`app/api/paypal/webhook/route.ts`).
   */
  allowCreate: boolean;
}

export interface PayPalFinalizeResult {
  orderId: string;
  orderKey: string;
  /** True when a prior finalize (the other racer) had already placed it. */
  alreadyFinalized: boolean;
}

/** Raised when the webhook has a payment but no draft order to adopt. */
export class PayPalFinalizeUnavailableError extends Error {
  constructor() {
    super("No draft order to finalize and creating one is not permitted here");
    this.name = "PayPalFinalizeUnavailableError";
  }
}

/** "0" is WooCommerce's sentinel for "no draft order yet", never a real id. */
export function hasDraftOrder(
  orderId: string | null | undefined,
  orderKey: string | null | undefined,
): boolean {
  return !!orderId && orderId !== "0" && !!orderKey;
}

/**
 * The `payment_data` bag. Exported so a test asserts the exact key set rather
 * than a mock's recollection of it.
 */
export function payPalPaymentData(
  payment: PayPalPaymentFacts,
): Array<{ key: string; value: string }> {
  return [
    // The claim key. See the docblock — this is deliberately the capture id.
    { key: "checkout_session_id", value: payment.paypalCaptureId },
    { key: "payment_status", value: "paid" },
    { key: "payment_provider", value: PAYPAL_PAYMENT_PROVIDER },
    { key: "payment_method", value: PAYPAL_PAYMENT_PROVIDER },
    { key: "payment_mode", value: payment.paymentMode },
    { key: "paypal_order_id", value: payment.paypalOrderId },
    { key: "paypal_capture_id", value: payment.paypalCaptureId },
  ];
}

/**
 * A finalize that failed because the payment was ALREADY finalised — by the
 * other racer, or by a webhook redelivery. Not a failure: the shopper has an
 * order and has been charged exactly once.
 *
 * Matched on the same message fragments the success page already treats as
 * "already finalized" (`app/checkout/success/[orderId]/page.tsx`), plus the
 * duplicate-claim rejection the theme's claim row produces.
 */
export function isAlreadyFinalizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) return false;
  return [
    "different customer",
    "invalid_user",
    "already been paid",
    "already paid",
    "cannot be paid for",
    "duplicate",
    "already processed",
  ].some((fragment) => message.includes(fragment));
}

export async function finalizePayPalOrder(
  input: PayPalFinalizeInput,
): Promise<PayPalFinalizeResult> {
  const paymentData = payPalPaymentData(input.payment);

  if (hasDraftOrder(input.orderId, input.orderKey)) {
    const orderId = input.orderId as string;
    const orderKey = input.orderKey as string;
    const orderInput: ProcessCheckoutOrderInput = {
      orderKey,
      billingAddress: input.billingAddress,
      shippingAddress: input.shippingAddress,
      ...(input.billingEmail ? { billingEmail: input.billingEmail } : {}),
      paymentMethod: STRIPE_PAYMENT_METHOD,
      paymentData,
    };
    try {
      const order = await processCheckoutOrderAction(
        input.cartToken,
        orderId,
        orderKey,
        orderInput,
      );
      return {
        orderId: order.orderId ?? orderId,
        orderKey: order.orderKey ?? orderKey,
        alreadyFinalized: false,
      };
    } catch (error) {
      if (isAlreadyFinalizedError(error)) {
        return { orderId, orderKey, alreadyFinalized: true };
      }
      throw error;
    }
  }

  // WooCommerce 10.8+ defers draft-order creation to POST /checkout, so a
  // store on that version reaches the Payment step with no draft to process.
  // The brief names `processCheckoutOrder` because that is the path with the
  // claim row; on a deferred store there is no order for it to act on, and
  // `processCheckout` carries the SAME generic `paymentData` bag through the
  // SAME Store API hook — so the claim key still lands and the theme still
  // reads it. What is lost is only the pre-existing draft, not the dedup.
  if (!input.allowCreate) {
    throw new PayPalFinalizeUnavailableError();
  }

  const createInput: ProcessCheckoutInput = {
    billingAddress: input.billingAddress,
    shippingAddress: input.shippingAddress,
    paymentMethod: STRIPE_PAYMENT_METHOD,
    paymentData,
  };
  // The explicit cart token matters only for the webhook, which has no cookie
  // jar; on the browser path it is the very token `getCartToken()` returned.
  const order = await processCheckoutAction(createInput, input.cartToken);
  if (!order.orderId || order.orderId === "0" || !order.orderKey) {
    throw new Error(
      "Your payment succeeded but the order confirmation could not be opened. Please check your email.",
    );
  }
  return {
    orderId: order.orderId,
    orderKey: order.orderKey,
    alreadyFinalized: false,
  };
}
