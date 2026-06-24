import { redirect } from "next/navigation";
import { getCheckoutSessionAction, processCheckoutAction } from "../actions";

/**
 * Legacy success entry: when user lands with only session_id (e.g. old bookmark
 * or successBaseUrl not set), fetch session to get orderId/orderKey and redirect
 * to the order-based URL.
 *
 * WC 10.8+ compatibility: when session.orderId is "0" or empty (deferred draft
 * order creation), the Stripe session was created before the WC draft order
 * existed. In this case we call processCheckoutAction with payment_data from the
 * Stripe session to create-and-finalize the order, then redirect using the real
 * orderId returned by WooCommerce. The Stripe webhook does the same thing
 * asynchronously; whichever runs first wins (WC POST /checkout is safe to call
 * once the cart is active).
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    redirect("/");
  }

  try {
    const session = await getCheckoutSessionAction(sessionId);

    // Only proceed for paid sessions.
    if (session.paymentStatus !== "paid") {
      redirect("/");
    }

    let orderId = session.orderId;
    let orderKey = session.orderKey;

    // WC 10.8+ deferred draft order: session.orderId is "0" or empty because
    // GET /checkout returned order_id=0 at session creation time. The webhook
    // finalizes the order asynchronously, but the success page may arrive before
    // the webhook completes. Call processCheckout to create-and-finalize the
    // order immediately so the user can see their order confirmation.
    if ((!orderId || orderId === "0") && session.cartToken) {
      const paymentData: { key: string; value: string }[] = [
        { key: "checkout_session_id", value: sessionId },
        { key: "payment_status", value: "paid" },
        { key: "payment_provider", value: "stripe" },
      ];
      if (session.paymentIntentId) {
        paymentData.push({
          key: "payment_intent_id",
          value: session.paymentIntentId,
        });
      }
      if (session.paymentMethod) {
        paymentData.push({
          key: "payment_method",
          value: session.paymentMethod,
        });
      }
      if (session.cardBrand) {
        paymentData.push({ key: "card_brand", value: session.cardBrand });
      }
      if (session.cardLast4) {
        paymentData.push({ key: "card_last4", value: session.cardLast4 });
      }
      if (session.livemode !== undefined) {
        paymentData.push({
          key: "payment_mode",
          value: session.livemode ? "live" : "test",
        });
      }
      if (session.stripeCustomerId) {
        paymentData.push({
          key: "stripe_customer_id",
          value: session.stripeCustomerId,
        });
      }

      const stripeAddr =
        session.shippingAddress ?? session.billingAddress ?? null;
      const billingAddress = {
        firstName: stripeAddr?.firstName ?? "",
        lastName: stripeAddr?.lastName ?? "",
        address1: stripeAddr?.address1 ?? "",
        ...(stripeAddr?.address2 ? { address2: stripeAddr.address2 } : {}),
        city: stripeAddr?.city ?? "",
        state: stripeAddr?.state ?? "",
        postcode: stripeAddr?.postcode ?? "",
        country: stripeAddr?.country ?? "",
        email: session.customerEmail ?? "",
        phone: stripeAddr?.phone ?? "",
      };
      const shippingAddress = {
        firstName: stripeAddr?.firstName ?? "",
        lastName: stripeAddr?.lastName ?? "",
        address1: stripeAddr?.address1 ?? "",
        ...(stripeAddr?.address2 ? { address2: stripeAddr.address2 } : {}),
        city: stripeAddr?.city ?? "",
        state: stripeAddr?.state ?? "",
        postcode: stripeAddr?.postcode ?? "",
        country: stripeAddr?.country ?? "",
        phone: stripeAddr?.phone ?? "",
      };

      try {
        const checkout = await processCheckoutAction({
          paymentMethod: "headkit-payments",
          billingAddress,
          shippingAddress,
          paymentData,
        });
        if (checkout?.orderId && checkout.orderId !== "0") {
          orderId = checkout.orderId;
          orderKey = checkout.orderKey;
        }
      } catch {
        /* processCheckout failed — almost always woocommerce_rest_cart_empty: the
           Stripe webhook won the race, already placed the order, and emptied the
           cart. The webhook writes the real order_id/order_key back onto the session
           metadata after creating the order, so poll the session below to resolve it. */
      }

      // Lost the create race (or our own POST hasn't reflected yet): poll the Stripe
      // session metadata, which the webhook updates with the real order_id/order_key
      // once it finishes creating the order. Bounded so we never hang the page.
      if (!orderId || orderId === "0" || !orderKey) {
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            const refreshed = await getCheckoutSessionAction(sessionId);
            if (
              refreshed.orderId &&
              refreshed.orderId !== "0" &&
              refreshed.orderKey
            ) {
              orderId = refreshed.orderId;
              orderKey = refreshed.orderKey;
              break;
            }
          } catch {
            /* transient — keep polling */
          }
        }
      }
    }

    if (orderId && orderId !== "0" && orderKey) {
      redirect(
        `/checkout/success/${orderId}?key=${encodeURIComponent(orderKey)}&session_id=${encodeURIComponent(sessionId)}`,
      );
    }
  } catch {
    /* Session fetch failed */
  }

  redirect("/");
}
