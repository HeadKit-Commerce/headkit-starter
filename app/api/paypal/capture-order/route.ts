import { NextResponse, type NextRequest } from "next/server";
import { getCartToken } from "@/lib/cart";
import { getFullCartAction } from "@/lib/cart-actions";
import {
  getCheckoutAction,
  expireCheckoutSessionAction,
} from "@/app/checkout/actions";
import { logger, errorFields } from "@/lib/logger";
import { getPayPalConfig, payPalPaymentMode } from "@/lib/paypal/config";
import { capturePayPalOrder, refundPayPalCapture } from "@/lib/paypal/client";
import {
  amountsWithinTolerance,
  cartTotalMinorUnits,
  toMinorUnits,
  type PayPalAmountCart,
} from "@/lib/paypal/amount";
import { resolvePayPalAddresses } from "@/lib/paypal/addresses";
import { finalizePayPalOrder, hasDraftOrder } from "@/lib/paypal/finalize";
import { getFloatVal } from "@/lib/utils";

/**
 * POST /api/paypal/capture-order.
 *
 * Captures the PayPal order, verifies what was actually taken, places the
 * WooCommerce order, and retires the Stripe session — all server-side, in that
 * order, in ONE round trip.
 *
 * ---------------------------------------------------------------------------
 * Why the finalize happens HERE and not in the browser
 * ---------------------------------------------------------------------------
 * v1 captured on the server and then let the BROWSER call checkout. If the tab
 * died in between, the shopper was charged and no order existed. Doing both
 * inside one request removes that window entirely for the ordinary case; the
 * webhook (`../webhook/route.ts`) covers what is left — this request itself
 * failing after the capture landed.
 *
 * ---------------------------------------------------------------------------
 * The amount guard is the anti-tamper control, and it is not optional
 * ---------------------------------------------------------------------------
 * The cart can change between create-order and capture, and PayPal's own
 * `PATCH` (see `../update-order`) is only advisory. So the captured amount is
 * compared against a FRESH server-side cart read — not against what
 * create-order quoted, which is exactly the number an attacker would have had
 * time to move. On a mismatch beyond one minor unit the capture is REFUNDED
 * before anything is written, and the response says `AMOUNT_MISMATCH`.
 *
 * A systematic totals bug therefore surfaces as "payment failed" on every
 * order rather than as silent under-charging. That is the correct trade and
 * it is why `lib/paypal/amount.test.ts` carries a 10%-GST fixture.
 *
 * ---------------------------------------------------------------------------
 * Ordering, exactly, and why `SUPERSEDED`
 * ---------------------------------------------------------------------------
 *   capture → verify → finalize → expire(stripe session, SUPERSEDED)
 *
 * The expire runs only AFTER the order call resolves. `SUPERSEDED` is a strict
 * no-op in commerce's `checkout.session.expired` handler; `CART_CHANGED` is
 * NOT — it makes that handler inspect the draft order and mark an orphan
 * `failed`, which after a successful PayPal capture would fail an order that
 * has been paid for. Never pass `CART_CHANGED` from this path.
 */

/** PayPal order ids are uppercase alphanumeric tokens. The ONLY client input. */
const PAYPAL_ORDER_ID_PATTERN = /^[A-Z0-9]{6,40}$/;
/** Stripe Checkout Session ids, when the client supplies one to retire. */
const STRIPE_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{10,255}$/;

interface CaptureBody {
  orderId?: unknown;
  stripeSessionId?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getPayPalConfig();
  if (!config) {
    return NextResponse.json(
      { error: "PayPal is not configured for this store." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as CaptureBody;
  const paypalOrderId =
    typeof body.orderId === "string" &&
    PAYPAL_ORDER_ID_PATTERN.test(body.orderId)
      ? body.orderId
      : null;
  if (!paypalOrderId) {
    return NextResponse.json(
      { error: "A PayPal order id is required." },
      { status: 400 },
    );
  }
  const stripeSessionId =
    typeof body.stripeSessionId === "string" &&
    STRIPE_SESSION_ID_PATTERN.test(body.stripeSessionId)
      ? body.stripeSessionId
      : null;

  const cartToken = await getCartToken();
  if (!cartToken) {
    return NextResponse.json(
      { error: "No active cart session." },
      { status: 400 },
    );
  }

  // FRESH read — the whole point of the guard. Taken BEFORE the capture so a
  // slow cart read cannot be blamed for a drift that happened after it.
  const cart = await getFullCartAction();
  if (!cart || cart.itemsCount === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }
  const expectedMinor = cartTotalMinorUnits(
    cart as unknown as PayPalAmountCart,
  );
  const { minorUnit, code: expectedCurrency } = cart.currency;

  let capturedOrder;
  try {
    capturedOrder = await capturePayPalOrder(config, paypalOrderId);
  } catch (error) {
    logger.error("paypal_capture_failed", {
      paypalOrderId,
      ...errorFields(error),
    });
    return NextResponse.json(
      { error: "PayPal could not complete this payment. Please try again." },
      { status: 502 },
    );
  }

  const capture = capturedOrder.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id) {
    logger.error("paypal_capture_missing_capture", { paypalOrderId });
    return NextResponse.json(
      { error: "PayPal returned no capture for this payment." },
      { status: 502 },
    );
  }

  const capturedMinor = toMinorUnits(
    getFloatVal(capture.amount?.value ?? "0"),
    minorUnit,
  );
  const capturedCurrency = capture.amount?.currency_code ?? "";
  const currencyMatches = capturedCurrency === expectedCurrency;

  if (
    !currencyMatches ||
    !amountsWithinTolerance(capturedMinor, expectedMinor)
  ) {
    logger.error("paypal_amount_mismatch", {
      paypalOrderId,
      captureId: capture.id,
      expectedMinor,
      capturedMinor,
      expectedCurrency,
      capturedCurrency,
    });
    let refunded = false;
    try {
      await refundPayPalCapture(
        config,
        capture.id,
        "Payment amount verification failed",
      );
      refunded = true;
    } catch (refundError) {
      // The refund failing does NOT make the payment acceptable — it makes it
      // a manual reversal. Say so loudly and still refuse.
      logger.error("paypal_auto_refund_failed", {
        paypalOrderId,
        captureId: capture.id,
        ...errorFields(refundError),
      });
    }
    return NextResponse.json(
      {
        error:
          "Your payment could not be verified against your cart total and has been reversed. Please try again.",
        code: "AMOUNT_MISMATCH",
        refunded,
      },
      { status: 400 },
    );
  }

  // The draft order, when this store's WooCommerce made one at session time.
  let draftOrderId: string | null = null;
  let draftOrderKey: string | null = null;
  try {
    const draft = await getCheckoutAction();
    if (hasDraftOrder(draft?.orderId, draft?.orderKey)) {
      draftOrderId = draft.orderId;
      draftOrderKey = draft.orderKey;
    }
  } catch (error) {
    logger.info("paypal_draft_order_unavailable", errorFields(error));
  }

  const addresses = resolvePayPalAddresses({
    cartBilling: cart.billingAddress,
    cartShipping: cart.shippingAddress,
    paypalOrder: capturedOrder,
  });

  let placed;
  try {
    placed = await finalizePayPalOrder({
      cartToken,
      orderId: draftOrderId,
      orderKey: draftOrderKey,
      billingAddress: addresses.billingAddress,
      shippingAddress: addresses.shippingAddress,
      billingEmail: addresses.billingEmail,
      payment: {
        paypalOrderId,
        paypalCaptureId: capture.id,
        paymentMode: payPalPaymentMode(config),
      },
      // Browser path: the shopper's cookies are present, so creating the order
      // when WooCommerce deferred the draft is both possible and correct.
      allowCreate: true,
    });
  } catch (error) {
    // The money HAS moved. Do not refund here — the webhook still has the
    // capture and the claim key, and a shopper who paid should end up with an
    // order, not a reversal chosen by a transient WooCommerce failure.
    logger.error("paypal_finalize_failed", {
      paypalOrderId,
      captureId: capture.id,
      ...errorFields(error),
    });
    return NextResponse.json(
      {
        error:
          "Your payment succeeded but we could not confirm your order here. Please check your email — do not pay again.",
        code: "FINALIZE_FAILED",
      },
      { status: 502 },
    );
  }

  // ONLY after the order call resolved, and ONLY as SUPERSEDED. See the
  // docblock. Fire-and-forget, exactly as the checkout's own supersede is:
  // `expireCheckoutSessionAction` swallows its own failures by design.
  if (stripeSessionId) {
    void expireCheckoutSessionAction(stripeSessionId, "SUPERSEDED").catch(
      () => {},
    );
  }

  logger.info("paypal_order_placed", {
    paypalOrderId,
    captureId: capture.id,
    orderId: placed.orderId,
    alreadyFinalized: placed.alreadyFinalized,
  });

  return NextResponse.json({
    success: true,
    orderId: placed.orderId,
    orderKey: placed.orderKey,
  });
}
