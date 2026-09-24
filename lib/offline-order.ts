import "server-only";
import type {
  AddressInput,
  ProcessCheckoutInput,
  ProcessCheckoutOrderInput,
} from "@headkit/sdk";
import {
  getCheckoutAction,
  getCheckoutSessionAction,
  processCheckoutAction,
  processCheckoutOrderAction,
} from "@/app/checkout/actions";
import { cookies } from "next/headers";
import { getCartToken } from "@/lib/cart";
import { getFullCartAction } from "@/lib/cart-actions";
import {
  cartAddressToInput,
  isUsableAddress,
  type CartAddressLike,
} from "@/lib/paypal/addresses";
import { hasDraftOrder, isAlreadyFinalizedError } from "@/lib/paypal/finalize";
import {
  BILLING_ADDRESS_COOKIE,
  parseBillingAddressCookie,
} from "@/lib/checkout-billing-cookie";
import { offlineGateways } from "@/lib/payment-gateways";
import { logger, errorFields } from "@/lib/logger";

/**
 * Placing a WooCommerce order against an OFFLINE gateway
 * from the Stripe-backed checkout — the mixed case where the shopper has
 * already walked Contact, Delivery and Shipping and then picks bank transfer,
 * cheque or cash on delivery instead of a card.
 *
 * ---------------------------------------------------------------------------
 * The order is UNPAID, on purpose, and nothing here pretends otherwise
 * ---------------------------------------------------------------------------
 * There is no payment session and no `payment_data` bag: the whole point of an
 * offline gateway is that WooCommerce records the order and the merchant
 * reconciles the money afterwards. WooCommerce's own `bacs` / `cheque` gateway
 * puts the order in `on-hold` and emails its instructions; `cod` uses
 * `processing`. This module must not add a `payment_status: paid` key to make
 * the confirmation page look tidier — that would tell the merchant an
 * unreconciled order had been paid for.
 *
 * ---------------------------------------------------------------------------
 * Two things the CLIENT does not get to decide
 * ---------------------------------------------------------------------------
 * 1. **The gateway id is validated against the cart.** The browser sends a
 *    string; the only ids accepted are the offline gateways WooCommerce itself
 *    reports as available for THIS cart. Without that check a client could
 *    place an order against any gateway id it liked — including one the
 *    merchant disabled precisely because it takes no money.
 * 2. **The addresses come from the CART and the STRIPE SESSION, never from
 *    the request.** The action takes no address argument at all, so nothing
 *    the browser says about who is being shipped to is trusted — and no
 *    address has to cross to the client for this path either.
 *
 *    THREE sources are read, in that order, and each one was added because
 *    the one before it came back empty on a real checkout:
 *
 *      a. **the CART**, which carries addresses on Ship-to-Home because
 *         WooCommerce needs them to quote a rate;
 *      b. **the checkout COOKIES** (`hk-billing-address`, written by the
 *         Billing step, and `hk-checkout-data`, the shipping/email pair) —
 *         the repo's existing deterministic handoff, and the only source that
 *         is right on CLICK & COLLECT, where nothing the shopper typed ever
 *         reaches the cart. Measured: a cart-only read
 *         finalizes with empty addresses and WooCommerce answers
 *         `woocommerce_rest_invalid_address` ("Suburb is required, Postcode is
 *         required, First name is required, Street address is required");
 *      c. **the STRIPE SESSION**, last, because its `customer_details` are
 *         STALE for tens of seconds after `updateBillingAddress()` — the
 *         ENG-801 finding that made those cookies exist
 *         (`lib/checkout-billing-cookie.ts`). Measured the same way: the
 *         session read came back with no usable address moments after the
 *         Billing step pushed one.
 *
 *    The cookies are written by the browser, so this is the same trust level
 *    the card path already accepts for billing (and the offline-only checkout
 *    for everything). What the client still cannot do is pick the GATEWAY, the
 *    price, or the cart.
 *
 * ---------------------------------------------------------------------------
 * Draft order first, exactly as the PayPal path does
 * ---------------------------------------------------------------------------
 * A Stripe Checkout Session usually left a DRAFT order behind, and finalizing
 * with `processCheckout` when a draft exists is how a store ends up with two
 * orders for one cart. So: adopt the draft through `processCheckoutOrder` when
 * there is one, and only create when WooCommerce deferred it (10.8+ defers
 * draft creation to `POST /checkout` — AGENTS.md). `hasDraftOrder` and
 * `isAlreadyFinalizedError` are imported from `lib/paypal/finalize.ts` rather
 * than copied: they are gateway-agnostic, and a second copy is a second thing
 * to get wrong.
 */

/** The `hk-checkout-data` cookie CheckoutForm keeps for the success page. */
const CHECKOUT_DATA_COOKIE = "hk-checkout-data";

interface CheckoutDataCookie {
  email?: string | null;
  shippingAddress?: CartAddressLike | null;
}

function parseCheckoutDataCookie(
  raw: string | undefined,
): CheckoutDataCookie | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as CheckoutDataCookie;
  } catch {
    return null;
  }
}

/** The first of these that WooCommerce would accept, or the last one tried. */
function firstUsable(
  ...candidates: Array<CartAddressLike | null | undefined>
): CartAddressLike | null | undefined {
  return candidates.find(isUsableAddress) ?? candidates[candidates.length - 1];
}

export interface PlacedOfflineOrder {
  orderId: string;
  orderKey: string;
  /** The gateway the order was placed against, echoed back for the log. */
  gatewayId: string;
}

/** A gateway id the cart does not actually offer. Never surfaced verbatim. */
export class OfflineGatewayNotOfferedError extends Error {
  constructor() {
    super("That payment method is not available for this order.");
    this.name = "OfflineGatewayNotOfferedError";
  }
}

/**
 * Place the current cart as an order against `gatewayId`.
 *
 * Throws with a message safe to show the shopper; the caller logs the cause.
 */
export async function placeOfflineOrder(
  gatewayId: string,
  stripeSessionId?: string | undefined,
): Promise<PlacedOfflineOrder> {
  const wanted = gatewayId.trim();
  if (!wanted) throw new OfflineGatewayNotOfferedError();

  const cookieStore = await cookies();
  const cartToken = await getCartToken();
  if (!cartToken) {
    throw new Error("Your cart session has expired. Please try again.");
  }

  const cart = await getFullCartAction();
  if (!cart || cart.itemsCount === 0) {
    throw new Error("Your cart is empty.");
  }

  // (1) above: the cart is the authority on which gateways exist.
  const offered = offlineGateways(cart.paymentMethods).some(
    (gateway) => gateway.id === wanted,
  );
  if (!offered) throw new OfflineGatewayNotOfferedError();

  // WooCommerce refuses a shippable cart with no rate selected. The shopper
  // chose one at the Shipping step, so this is a guard rather than a branch —
  // but it fails with a sentence they can act on instead of a REST error.
  const hasRate = (cart.shippingRates ?? []).some((pkg) =>
    (pkg?.shippingRates ?? []).some((rate) => rate?.selected),
  );
  if (cart.needsShipping && !hasRate) {
    throw new Error("Choose a delivery option before placing this order.");
  }

  // (2) above. The Stripe session is read only when the cart's own addresses
  // are unusable, which is the Click & Collect case; a failure to read it is
  // not fatal on its own, because the cart may still have what is needed.
  let session: Awaited<ReturnType<typeof getCheckoutSessionAction>> | null =
    null;
  if (stripeSessionId) {
    try {
      session = await getCheckoutSessionAction(stripeSessionId);
    } catch (error) {
      logger.info("offline_session_unavailable", errorFields(error));
    }
  }

  const cookieBilling = parseBillingAddressCookie(
    cookieStore.get(BILLING_ADDRESS_COOKIE)?.value,
  );
  const checkoutData = parseCheckoutDataCookie(
    cookieStore.get(CHECKOUT_DATA_COOKIE)?.value,
  );

  const billingSource = firstUsable(
    cart.billingAddress,
    cookieBilling,
    session?.billingAddress,
    cart.shippingAddress,
    checkoutData?.shippingAddress,
    session?.shippingAddress,
  );
  // Shipping falls back to billing because WooCommerce requires both and a
  // pickup order has no separate delivery address of its own.
  const shippingSource = firstUsable(
    cart.shippingAddress,
    checkoutData?.shippingAddress,
    session?.shippingAddress,
    billingSource,
  );
  const billingEmail =
    cart.billingAddress?.email?.trim() ||
    billingSource?.email?.trim() ||
    checkoutData?.email?.trim() ||
    session?.customerEmail?.trim() ||
    undefined;

  if (!isUsableAddress(billingSource)) {
    throw new Error(
      "We could not read your address. Please reload the checkout and try again.",
    );
  }

  const billingAddress: AddressInput = cartAddressToInput(
    billingSource,
    billingEmail,
  );
  const shippingAddress: AddressInput = cartAddressToInput(shippingSource);

  let draftOrderId: string | null = null;
  let draftOrderKey: string | null = null;
  try {
    const draft = await getCheckoutAction();
    if (hasDraftOrder(draft?.orderId, draft?.orderKey)) {
      draftOrderId = draft.orderId;
      draftOrderKey = draft.orderKey;
    }
  } catch (error) {
    logger.info("offline_draft_order_unavailable", errorFields(error));
  }

  if (draftOrderId && draftOrderKey) {
    const orderInput: ProcessCheckoutOrderInput = {
      orderKey: draftOrderKey,
      billingAddress,
      shippingAddress,
      ...(billingEmail ? { billingEmail } : {}),
      paymentMethod: wanted,
    };
    try {
      const order = await processCheckoutOrderAction(
        cartToken,
        draftOrderId,
        draftOrderKey,
        orderInput,
      );
      return {
        orderId: order.orderId ?? draftOrderId,
        orderKey: order.orderKey ?? draftOrderKey,
        gatewayId: wanted,
      };
    } catch (error) {
      // A second submit (double click, a retry after a lost response) reaches
      // an order WooCommerce has already placed. The shopper has an order;
      // route them to it rather than showing a failure.
      if (isAlreadyFinalizedError(error)) {
        return {
          orderId: draftOrderId,
          orderKey: draftOrderKey,
          gatewayId: wanted,
        };
      }
      throw error;
    }
  }

  const createInput: ProcessCheckoutInput = {
    billingAddress,
    shippingAddress,
    paymentMethod: wanted,
  };
  const order = await processCheckoutAction(createInput);
  // "0" is WooCommerce's sentinel for "no order", never a real id.
  if (!order.orderId || order.orderId === "0" || !order.orderKey) {
    throw new Error(
      "Your order was placed, but its confirmation page could not be opened. Please check your order confirmation email.",
    );
  }
  return {
    orderId: order.orderId,
    orderKey: order.orderKey,
    gatewayId: wanted,
  };
}

/**
 * The sentence the SHOPPER sees when a finalize fails.
 *
 * A WooCommerce Store API rejection arrives as one long string: a prefix, a
 * status code, and the whole JSON body — cart contents, prices, shipping rates
 * and all. Two things are wrong with showing that: it is unreadable, and it
 * puts the entire cart payload on screen. But the body's own `message` IS
 * written for shoppers, and it is the one that matters — e.g.
 *
 *   "Your order cannot be checked out via \"Pay by bank\". To complete your
 *    order via \"Pay by bank\", please increase your order total to
 *    $1,000.00 or higher."
 *
 * That is WooCommerce Conditional Shipping and Payments restricting the
 * gateway — a restriction the cart's `paymentMethods` list does NOT reflect
 * (measured 2026-09-13: `bacs` is listed as available
 * while the extension reports `is_excluded: true` for it, in a cart
 * `extensions` field commerce does not carry). So the row is offered and the
 * restriction is only discovered at Place order. Surfacing WooCommerce's own
 * sentence is what makes that survivable; hiding the row for a restricted cart
 * needs the platform to route the restriction.
 */
export function shopperFacingOrderError(error: unknown): string {
  const generic = "Could not place your order. Please try again.";
  const raw = error instanceof Error ? error.message : "";
  if (!raw) return generic;

  const start = raw.indexOf("{");
  if (start !== -1) {
    try {
      const body = JSON.parse(raw.slice(start)) as { message?: unknown };
      const message =
        typeof body.message === "string" ? body.message.trim() : "";
      if (message) {
        const text = message
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text.length > 280 ? `${text.slice(0, 277)}…` : text;
      }
    } catch {
      /* not a JSON body — fall through */
    }
    // A payload we could not read is never shown verbatim.
    return generic;
  }
  return raw;
}
