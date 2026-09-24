import { NextResponse, type NextRequest } from "next/server";
import { logger, errorFields } from "@/lib/logger";
import {
  getPayPalConfig,
  getPayPalWebhookId,
  payPalPaymentMode,
} from "@/lib/paypal/config";
import {
  getPayPalOrder,
  verifyPayPalWebhookSignature,
  PayPalApiError,
  type PayPalOrder,
  type PayPalWebhookHeaders,
} from "@/lib/paypal/client";
import { decodePayPalContext } from "@/lib/paypal/context";
import { resolvePayPalAddresses } from "@/lib/paypal/addresses";
import { readCartByToken, type PayPalWebhookCart } from "@/lib/paypal/cart";
import {
  finalizePayPalOrder,
  hasDraftOrder,
  isAlreadyFinalizedError,
} from "@/lib/paypal/finalize";

/**
 * POST /api/paypal/webhook.
 *
 * The durable writer. Without it, a browser that dies between capture and
 * finalize leaves a charged shopper with no order — which is what v1 shipped,
 * and which the CARD path in this same checkout already closes with a Stripe
 * webhook. Shipping PayPal without this would be a visible regression against
 * the card path, not parity.
 *
 * ---------------------------------------------------------------------------
 * Verify BEFORE any lookup, and fail closed
 * ---------------------------------------------------------------------------
 * Nothing is read, resolved or written until PayPal's own
 * `POST /v1/notifications/verify-webhook-signature` has answered SUCCESS —
 * same ordering as commerce's Stripe handler. Two ways to be unverifiable are
 * distinguished, and NEITHER produces a side effect:
 *
 *   `PAYPAL_WEBHOOK_ID` unset → 503. We cannot verify, so we must not act, and
 *                               a 503 is retryable once the id is configured.
 *   verification failed       → 401. Not ours, or forged.
 *
 * An event this store simply does not act on is acknowledged 200 — retrying it
 * forever helps nobody.
 *
 * ---------------------------------------------------------------------------
 * Idempotency is the WordPress claim row, not a second mechanism here
 * ---------------------------------------------------------------------------
 * The finalize keys on the PayPal CAPTURE ID in the `checkout_session_id`
 * slot, which is the same atomic `INSERT IGNORE` claim the card path uses. So
 * this handler and the browser can race freely: the loser's rejection is
 * recognised by `isAlreadyFinalizedError` and reported as success. See
 * `lib/paypal/finalize.ts`.
 *
 * ---------------------------------------------------------------------------
 * The CART TOKEN is what it finalises against, not the draft order
 * ---------------------------------------------------------------------------
 * It carries no cookies, so it works from what `create-order` stored on the
 * PayPal order (`lib/paypal/context.ts` explains why those fields and what the
 * precedent is). The first version of this handler additionally required a
 * WooCommerce draft order id + key, and on WooCommerce 10.8+ that requirement
 * makes it INERT: 10.8 defers draft creation to `POST /checkout`, so every
 * PayPal order the storefront makes carries `custom_id: "hk1||"` and the
 * handler logged `paypal_webhook_finalize_unavailable` on every single event
 * (observed live 2026-09-12 — money moved, the browser was the only thing that
 * could produce an order). A durable writer that never writes is not a safety
 * property.
 *
 * `reference_id` carries the Store API cart token, and a cart is all a
 * finalize needs. So the handler now finalises from the cart token, and
 * `context.orderId`/`orderKey` are used only when a store's WooCommerce DID
 * make a draft (the adopt branch).
 *
 * ---------------------------------------------------------------------------
 * Two orders for one capture is the failure that matters. Three things stop it
 * ---------------------------------------------------------------------------
 *   1. The claim row. `checkout_session_id` is the PayPal CAPTURE ID, so the
 *      theme's atomic `INSERT IGNORE` refuses a second finalize for the same
 *      capture and {@link isAlreadyFinalizedError} reads that refusal as
 *      success. This is the authority, and it is shared with the card path.
 *   2. A pre-write CART READ. Before creating anything the handler reads the
 *      cart server-side; a finalize that already happened emptied it, so an
 *      item-less cart means "someone else got there" and the handler writes
 *      nothing. This is the check that does not depend on the theme.
 *   3. Amount verification lives in commerce, not here (platform PR #479):
 *      a `payment_status: paid` sent with `payment_provider: paypal` is
 *      re-derived from PayPal's own capture record before WooCommerce sees it.
 *      Which is why `payPalPaymentData()` must keep sending that exact bag.
 *
 * Nothing about money or cart contents is read from the request body. The body
 * supplies identifiers; every value is read back from PayPal or WooCommerce.
 *
 * The residual manual-reconciliation surface is now only the events this
 * handler still cannot act on — no cart token carried, or a cart that is gone
 * — and they are logged as `paypal_webhook_finalize_unavailable`.
 */

/** Events this store acts on, plus the ones it deliberately only records. */
type HandledEvent =
  | "PAYMENT.CAPTURE.COMPLETED"
  | "PAYMENT.CAPTURE.DENIED"
  | "PAYMENT.CAPTURE.REFUNDED"
  | "PAYMENT.CAPTURE.PENDING"
  | "CHECKOUT.ORDER.APPROVED";

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { currency_code?: string; value?: string };
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

function readSignatureHeaders(
  request: NextRequest,
): PayPalWebhookHeaders | null {
  const get = (name: string): string => request.headers.get(name) ?? "";
  const headers: PayPalWebhookHeaders = {
    transmissionId: get("paypal-transmission-id"),
    transmissionTime: get("paypal-transmission-time"),
    transmissionSig: get("paypal-transmission-sig"),
    certUrl: get("paypal-cert-url"),
    authAlgo: get("paypal-auth-algo"),
  };
  return Object.values(headers).every((value) => value.length > 0)
    ? headers
    : null;
}

/** Acknowledge without acting. Every early return that is not a refusal. */
function ack(event: string, fields?: Record<string, unknown>): NextResponse {
  logger.info(event, fields);
  return NextResponse.json({ received: true });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getPayPalConfig();
  if (!config) {
    // Not configured for this store: nothing to verify against, nothing to do.
    return NextResponse.json(
      { error: "PayPal is not configured for this store." },
      { status: 503 },
    );
  }

  const webhookId = getPayPalWebhookId();
  if (!webhookId) {
    logger.error("paypal_webhook_unverifiable", { reason: "webhook_id_unset" });
    return NextResponse.json(
      { error: "Webhook verification is not configured." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  const headers = readSignatureHeaders(request);
  if (!headers) {
    logger.error("paypal_webhook_rejected", { reason: "missing_headers" });
    return NextResponse.json({ error: "Unverified." }, { status: 401 });
  }

  // NOTHING above this line touched a store, an order or a cart.
  const verified = await verifyPayPalWebhookSignature(
    config,
    webhookId,
    headers,
    event,
  );
  if (!verified) {
    logger.error("paypal_webhook_rejected", {
      reason: "signature_invalid",
      eventType: event.event_type ?? "",
    });
    return NextResponse.json({ error: "Unverified." }, { status: 401 });
  }

  const eventType = (event.event_type ?? "") as HandledEvent;
  const captureId = event.resource?.id ?? "";
  const paypalOrderId =
    event.resource?.supplementary_data?.related_ids?.order_id ?? "";

  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED":
      // Approved is not captured. Acting on it would place an order for money
      // that has not moved.
      return ack("paypal_webhook_order_approved", { paypalOrderId });

    case "PAYMENT.CAPTURE.PENDING":
      return ack("paypal_webhook_capture_pending", {
        captureId,
        paypalOrderId,
      });

    case "PAYMENT.CAPTURE.DENIED":
      // The order, if one exists, was never paid. WooCommerce leaves an
      // unfinalised draft to its own cleanup, and finalising it `failed` from
      // here would need the same cart context a denied capture rarely has.
      // Recorded so a denied capture is visible in the runtime log.
      logger.error("paypal_webhook_capture_denied", {
        captureId,
        paypalOrderId,
      });
      return NextResponse.json({ received: true });

    case "PAYMENT.CAPTURE.REFUNDED":
      // Refunds are owned end to end by WooCommerce → dashboard-api
      // `POST /woocommerce/refund-paypal`, which writes the WC refund record.
      // A refund started in the PayPal dashboard instead arrives here; mirror
      // it into the log so the divergence is findable. Writing a WC refund
      // from here would double-count the ones WooCommerce already recorded.
      logger.info("paypal_webhook_capture_refunded", {
        captureId,
        paypalOrderId,
        amount: event.resource?.amount?.value ?? "",
      });
      return NextResponse.json({ received: true });

    case "PAYMENT.CAPTURE.COMPLETED":
      break;

    default:
      return ack("paypal_webhook_ignored", { eventType });
  }

  if (!captureId || !paypalOrderId) {
    return ack("paypal_webhook_capture_incomplete", {
      captureId,
      paypalOrderId,
    });
  }

  // The context lives on the ORDER, not the capture: `reference_id` carries
  // the cart token and is not copied onto a capture object.
  let order: PayPalOrder;
  try {
    order = await getPayPalOrder(config, paypalOrderId);
  } catch (error) {
    // A 404 (`INVALID_RESOURCE_ID`) is PERMANENT: that order id will never
    // resolve, so 502 here buys nothing but an infinite redelivery loop —
    // measured live, one simulated event produced two 502 deliveries 22 s
    // apart and would have gone on for days. Everything else (5xx, a
    // transport failure, which `PayPalApiError` reports as status 0) is
    // transient and MUST be retried: losing a paid event is the worst outcome
    // this route has.
    if (error instanceof PayPalApiError && error.status === 404) {
      logger.error("paypal_webhook_order_not_found", {
        paypalOrderId,
        captureId,
        ...errorFields(error),
      });
      return NextResponse.json({ received: true });
    }
    logger.error("paypal_webhook_order_read_failed", {
      paypalOrderId,
      ...errorFields(error),
    });
    // 502 so PayPal retries — a transient read must not lose the event.
    return NextResponse.json(
      { error: "Upstream read failed." },
      { status: 502 },
    );
  }

  const unit = order.purchase_units?.[0];
  const context = decodePayPalContext({
    customId: unit?.custom_id ?? event.resource?.custom_id,
    referenceId: unit?.reference_id,
  });
  if (!context) {
    // A PayPal order this storefront did not create. Ack — it is not ours.
    return ack("paypal_webhook_not_ours", { paypalOrderId });
  }

  if (!context.cartToken) {
    // Nothing identifies the cart, so there is nothing to finalise against and
    // a redelivery cannot supply what was never stored. This is the
    // reconciliation surface; the log line is what makes it findable.
    logger.error("paypal_webhook_finalize_unavailable", {
      paypalOrderId,
      captureId,
      reason: "cart_token_missing",
    });
    return NextResponse.json({ received: true });
  }

  const adoptsDraft = hasDraftOrder(context.orderId, context.orderKey);

  // Read the cart BEFORE writing anything. It does two jobs:
  //   - it is the duplicate check on the create branch (see the docblock): a
  //     finalize that already happened emptied this cart;
  //   - it is the address source, and the cart is the address that the
  //     shipping rate was quoted against (`lib/paypal/addresses.ts`).
  let cart: PayPalWebhookCart | null = null;
  let cartReadFailed = false;
  try {
    cart = await readCartByToken(context.cartToken);
  } catch (error) {
    cartReadFailed = true;
    logger.error("paypal_webhook_cart_read_failed", {
      paypalOrderId,
      captureId,
      ...errorFields(error),
    });
  }

  if (!adoptsDraft) {
    // Creating needs the cart; adopting a draft does not, so this gate is the
    // create branch's alone.
    if (cartReadFailed) {
      // Unknown, not empty. Guessing "already ordered" here would drop a paid
      // event on a WooCommerce blip.
      return NextResponse.json({ error: "Cart read failed." }, { status: 502 });
    }
    if (!cart) {
      logger.error("paypal_webhook_finalize_unavailable", {
        paypalOrderId,
        captureId,
        reason: "cart_missing",
      });
      return NextResponse.json({ received: true });
    }
    if (cart.itemsCount === 0) {
      // The ordinary redelivery / lost-race outcome, and a success: the order
      // exists, placed by whoever emptied this cart.
      return ack("paypal_webhook_cart_consumed", { paypalOrderId, captureId });
    }
  }

  const addresses = resolvePayPalAddresses({
    cartBilling: cart?.billingAddress ?? null,
    cartShipping: cart?.shippingAddress ?? null,
    paypalOrder: order,
  });

  try {
    const placed = await finalizePayPalOrder({
      cartToken: context.cartToken,
      orderId: context.orderId,
      orderKey: context.orderKey,
      billingAddress: addresses.billingAddress,
      shippingAddress: addresses.shippingAddress,
      billingEmail: addresses.billingEmail,
      payment: {
        paypalOrderId,
        paypalCaptureId: captureId,
        paymentMode: payPalPaymentMode(config),
      },
      // The cart read above is what makes this safe — see the docblock. With
      // WooCommerce deferring the draft, `false` here means no order at all.
      allowCreate: true,
    });
    logger.info("paypal_webhook_order_placed", {
      paypalOrderId,
      captureId,
      orderId: placed.orderId,
      // The ordinary outcome when the browser won the race, and it is a
      // success, not a warning.
      alreadyFinalized: placed.alreadyFinalized,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    if (isAlreadyFinalizedError(error)) {
      return ack("paypal_webhook_already_finalized", {
        paypalOrderId,
        captureId,
      });
    }
    logger.error("paypal_webhook_finalize_failed", {
      paypalOrderId,
      captureId,
      ...errorFields(error),
    });
    // 502 so PayPal retries this one — the shopper has paid and has no order.
    return NextResponse.json({ error: "Finalize failed." }, { status: 502 });
  }
}
