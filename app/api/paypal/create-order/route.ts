import { NextResponse } from "next/server";
import { getCartToken } from "@/lib/cart";
import { getFullCartAction } from "@/lib/cart-actions";
import { getCheckoutAction } from "@/app/checkout/actions";
import { logger, errorFields } from "@/lib/logger";
import { getPayPalConfig } from "@/lib/paypal/config";
import { createPayPalOrder } from "@/lib/paypal/client";
import {
  payPalAmountFromCart,
  type PayPalAmountCart,
} from "@/lib/paypal/amount";
import { encodePayPalContext } from "@/lib/paypal/context";
import { hasPayPalOption } from "@/lib/payment-gateways";
import { hasDraftOrder } from "@/lib/paypal/finalize";

/**
 * POST /api/paypal/create-order.
 *
 * Creates the PayPal order the JS SDK's buttons hand off to. Everything that
 * decides money is read SERVER-SIDE from the WooCommerce cart the shopper's
 * `hk-cart-token` cookie identifies; the request body carries nothing. That is
 * not defensive style, it is the whole security property — a client-supplied
 * amount is a client-chosen price.
 *
 * The eligibility rules are `hasPayPalOption`, evaluated again here rather than
 * trusted from the UI: the button not being rendered is a UI fact, and a route
 * must not rely on one.
 *
 * `shipping_preference` and the shipping block are set from the DELIVERY CHOICE
 * the shopper already made, not offered for PayPal to change:
 *
 *   ship-to-home  → SET_PROVIDED_ADDRESS with the cart's shipping address, so
 *                   the buyer cannot pick a different address inside PayPal's
 *                   popup and desync from the rate the total was quoted at.
 *   click&collect → NO_SHIPPING. Nothing is being delivered to the buyer, and
 *                   handing PayPal the store's address as a "shipping address"
 *                   would put it on the order.
 *   no shipping   → NO_SHIPPING.
 *
 * v1 used `GET_FROM_FILE` with a rate list because its PayPal step ran BEFORE
 * any address was collected. Ours runs after, so letting PayPal re-open the
 * question would only create drift for the capture guard to reject.
 */

/** WooCommerce's own pickup rate ids, as the checkout already matches them. */
function isPickupRate(rateId: string): boolean {
  return rateId.includes("local_pickup") || rateId.includes("pickup_location");
}

export async function POST(): Promise<NextResponse> {
  const config = getPayPalConfig();
  if (!config) {
    return NextResponse.json(
      { error: "PayPal is not configured for this store." },
      { status: 503 },
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
  if (!cart || cart.itemsCount === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  if (!hasPayPalOption(cart, true)) {
    return NextResponse.json(
      { error: "PayPal is not available for this cart." },
      { status: 400 },
    );
  }

  const amount = payPalAmountFromCart(cart as unknown as PayPalAmountCart);

  // A truncated item list, exactly as v1 did — NOT an `items[]` array. See the
  // module docblock in `lib/paypal/amount.ts` for why itemising is a trap.
  const description = (cart.items ?? [])
    .map((item) => `${item.name} x${item.quantity}`)
    .join(", ")
    .slice(0, 127);

  const chosenPickup = (cart.shippingRates ?? []).some((pkg) =>
    (pkg?.shippingRates ?? []).some(
      (rate) => rate?.selected && isPickupRate(rate.rateId),
    ),
  );
  const shipsToBuyer = !!cart.needsShipping && !chosenPickup;
  const shippingAddress = cart.shippingAddress;
  const canProvideAddress = shipsToBuyer && !!shippingAddress?.address1?.trim();

  // The draft order, when this store's WooCommerce created one at session time.
  // On WC 10.8+ it is deferred and this reports "0" — which is not an error,
  // only the loss of the webhook's ability to adopt an existing draft.
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

  const context = encodePayPalContext({
    orderId: draftOrderId,
    orderKey: draftOrderKey,
    cartToken,
  });
  if (context.cartTokenOmitted) {
    // Named, not swallowed: the browser path is unaffected, but the WEBHOOK
    // cannot finalise this one order on its own if the tab dies mid-capture.
    logger.info("paypal_webhook_context_omitted", {
      reason: "cart_token_too_long",
      length: cartToken.length,
    });
  }

  const purchaseUnit: Record<string, unknown> = {
    reference_id: context.referenceId,
    custom_id: context.customId,
    amount,
    ...(description ? { description } : {}),
  };

  if (canProvideAddress) {
    purchaseUnit["shipping"] = {
      name: {
        full_name:
          [shippingAddress?.firstName, shippingAddress?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || "Customer",
      },
      address: {
        address_line_1: shippingAddress?.address1 ?? "",
        ...(shippingAddress?.address2
          ? { address_line_2: shippingAddress.address2 }
          : {}),
        admin_area_1: shippingAddress?.state ?? "",
        admin_area_2: shippingAddress?.city ?? "",
        postal_code: shippingAddress?.postcode ?? "",
        country_code: (shippingAddress?.country ?? "").toUpperCase(),
      },
    };
  }

  const payload = {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
    application_context: {
      shipping_preference: canProvideAddress
        ? "SET_PROVIDED_ADDRESS"
        : "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  try {
    const order = await createPayPalOrder(config, payload);
    logger.info("paypal_order_created", {
      paypalOrderId: order.id,
      currency: amount.currency_code,
      // The amount is logged deliberately: it is the number the amount guard
      // compares at capture, and without it a mismatch cannot be diagnosed.
      value: amount.value,
      shippingPreference: payload.application_context.shipping_preference,
      hasDraftOrder: draftOrderId !== null,
    });
    return NextResponse.json({ orderId: order.id, status: order.status });
  } catch (error) {
    logger.error("paypal_create_order_failed", errorFields(error));
    return NextResponse.json(
      { error: "Could not start the PayPal payment. Please try again." },
      { status: 502 },
    );
  }
}
