"use server";

import { expireCheckoutSessionAction } from "@/app/checkout/actions";
import {
  placeOfflineOrder,
  shopperFacingOrderError,
  OfflineGatewayNotOfferedError,
} from "@/lib/offline-order";
import { logger, errorFields } from "@/lib/logger";

/**
 * The Payment step's "Place order" for an OFFLINE gateway.
 *
 * A thin action over `lib/offline-order.ts`, which holds the rules and states
 * them. Two things live here rather than there:
 *
 * - **Retiring the Stripe session**, only AFTER the order call resolved and
 *   only as `SUPERSEDED`. `CART_CHANGED` makes commerce's expired-session
 *   handler inspect the draft order and mark an orphan `failed` — which, on an
 *   order that has just been placed, fails a real order. Same rule, same
 *   reason, as the PayPal capture route; fire-and-forget, because
 *   `expireCheckoutSessionAction` swallows its own failures by design.
 * - **The error the browser sees.** A WooCommerce Store API rejection carries
 *   the ENTIRE cart payload in its message, so it is never shown verbatim;
 *   `shopperFacingOrderError` reduces it to the body's own shopper-facing
 *   sentence (which on this store is the gateway's order-total restriction) or
 *   to a generic one. The full error is logged.
 */

export interface PlaceOfflineOrderResult {
  orderId: string;
  orderKey: string;
}

export async function placeOfflineOrderAction(
  gatewayId: string,
  stripeSessionId?: string,
): Promise<PlaceOfflineOrderResult> {
  let placed;
  try {
    placed = await placeOfflineOrder(gatewayId, stripeSessionId);
  } catch (error) {
    logger.error("offline_order_failed", {
      // The id the CLIENT asked for; it is validated against the cart inside
      // and may well be the reason this failed.
      requestedGateway: gatewayId,
      ...errorFields(error),
    });
    if (error instanceof OfflineGatewayNotOfferedError) throw error;
    throw new Error(shopperFacingOrderError(error));
  }

  if (stripeSessionId) {
    void expireCheckoutSessionAction(stripeSessionId, "SUPERSEDED").catch(
      () => {},
    );
  }

  logger.info("offline_order_placed", {
    gateway: placed.gatewayId,
    orderId: placed.orderId,
  });

  return { orderId: placed.orderId, orderKey: placed.orderKey };
}
