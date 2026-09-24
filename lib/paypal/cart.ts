import "server-only";
import type { GetCartQuery } from "@headkit/sdk";
import { createServerHeadkit } from "@/lib/sdk.server";

/**
 * Reading a WooCommerce cart by an EXPLICIT token, for the
 * PayPal webhook.
 *
 * Every other cart read in this app resolves the token from the `hk-cart-token`
 * cookie. A webhook has no cookies — it carries the token on the PayPal order
 * instead (`lib/paypal/context.ts`) — so it needs this one.
 *
 * It deliberately does NOT swallow failures the way `getFullCartAction` does.
 * The webhook has to tell three states apart and acts differently on each:
 *
 *   a cart with items  → the browser never finalised; finalise it here
 *   a cart with none   → the cart was already consumed, almost certainly by a
 *                        browser finalize that won the race; ack, write nothing
 *   a failed read      → unknown; let PayPal redeliver rather than guess
 *
 * Collapsing the last two into `null`, which is what a swallowing read does,
 * would make a transient WooCommerce blip look exactly like a completed order
 * and silently drop a paid event.
 *
 * No auth token is passed: a webhook is never a logged-in session, and the
 * cart token alone is what scopes the read.
 */
export type PayPalWebhookCart = NonNullable<GetCartQuery["commerce"]["cart"]>;

export function readCartByToken(
  cartToken: string,
): Promise<PayPalWebhookCart | null> {
  return createServerHeadkit(cartToken).cart.get();
}
