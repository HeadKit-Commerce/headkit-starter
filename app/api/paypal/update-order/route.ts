import { NextResponse, type NextRequest } from "next/server";
import { getCartToken } from "@/lib/cart";
import { getFullCartAction } from "@/lib/cart-actions";
import { logger, errorFields } from "@/lib/logger";
import { getPayPalConfig } from "@/lib/paypal/config";
import { getPayPalOrder, patchPayPalOrder } from "@/lib/paypal/client";
import {
  payPalAmountFromCart,
  type PayPalAmountCart,
} from "@/lib/paypal/amount";
import { hasPayPalOption } from "@/lib/payment-gateways";

/**
 * PATCH /api/paypal/update-order.
 *
 * Re-quotes an open PayPal order after the cart changed under it (a coupon
 * applied while the buttons were on screen, a shipping rate re-selected).
 *
 * ---------------------------------------------------------------------------
 * The client says WHICH order. It does not say what to charge.
 * ---------------------------------------------------------------------------
 * v1's version took `{ orderId, payload }` and forwarded `payload` to PayPal
 * verbatim (`src/app/api/paypal/update-order/route.ts:41`) — a client-supplied
 * patch body against a live money object, i.e. a price the buyer picks. This
 * one accepts only the order id and rebuilds the amount from the same
 * server-side cart read `create-order` used. That is a deliberate departure
 * from the port, not an oversight.
 *
 * ---------------------------------------------------------------------------
 * This is advisory. The capture guard is what actually protects the charge.
 * ---------------------------------------------------------------------------
 * A PATCH keeps PayPal's own UI honest about the amount the buyer is
 * approving. It cannot be relied on for correctness: it races the cart like
 * everything else, and PayPal rejects a patch once the buyer has approved. The
 * FRESH re-verify at capture is the guarantee; a failed patch is logged and
 * answered 200 with `patched: false` rather than blocking a checkout the
 * capture guard would have caught anyway.
 */

const PAYPAL_ORDER_ID_PATTERN = /^[A-Z0-9]{6,40}$/;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const config = getPayPalConfig();
  if (!config) {
    return NextResponse.json(
      { error: "PayPal is not configured for this store." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: unknown;
  };
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

  const cartToken = await getCartToken();
  if (!cartToken) {
    return NextResponse.json(
      { error: "No active cart session." },
      { status: 400 },
    );
  }

  const cart = await getFullCartAction();
  if (!cart || !hasPayPalOption(cart, true)) {
    return NextResponse.json(
      { error: "PayPal is not available for this cart." },
      { status: 400 },
    );
  }

  const amount = payPalAmountFromCart(cart as unknown as PayPalAmountCart);

  try {
    // PayPal addresses a purchase unit by its `reference_id`, so the path has
    // to name the value THIS order actually carries. Read it back rather than
    // reconstructing it: `create-order` writes the cart token there, and the
    // cookie may have rotated since (`withCartRetry` mints a fresh session on
    // an expired token), which would silently patch nothing.
    const order = await getPayPalOrder(config, paypalOrderId);
    const referenceId = order.purchase_units?.[0]?.reference_id ?? "default";
    await patchPayPalOrder(config, paypalOrderId, [
      {
        op: "replace",
        path: `/purchase_units/@reference_id=='${referenceId}'/amount`,
        value: amount,
      },
    ]);
    logger.info("paypal_order_patched", {
      paypalOrderId,
      value: amount.value,
      currency: amount.currency_code,
    });
    return NextResponse.json({ patched: true, value: amount.value });
  } catch (error) {
    logger.info("paypal_patch_failed", {
      paypalOrderId,
      ...errorFields(error),
    });
    return NextResponse.json({ patched: false, value: amount.value });
  }
}
