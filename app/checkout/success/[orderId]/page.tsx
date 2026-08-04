import type { Metadata, ResolvingMetadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  getOrderAction,
  getCheckoutSessionAction,
  processCheckoutOrderAction,
} from "@/app/checkout/actions";
import { ClearCart } from "@/components/checkout/clear-cart";
import { PaymentProcessing } from "@/components/checkout/payment-processing";
import { LineItemDisplay } from "@/components/checkout/line-item-display";
import { PaymentMethodDisplay } from "@/components/checkout/payment-method-display";
import { needsCheckoutOrderProcessing } from "@/lib/checkout-success-utils";
import { getFloatVal, formatPrice } from "@/lib/utils";
import {
  BILLING_ADDRESS_COOKIE,
  parseBillingAddressCookie,
} from "@/lib/checkout-billing-cookie";

interface Props {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ key?: string; session_id?: string }>;
}

interface StoredCheckoutData {
  email?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    phone?: string;
  };
}

export async function generateMetadata(
  _props: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = await parent;
  return { title: p.title, description: p.description };
}

export default async function Page({ params, searchParams }: Props) {
  const { orderId } = await params;
  const { key: orderKey, session_id: sessionId } = await searchParams;

  if (!orderId || !orderKey) return notFound();

  const cookieStore = await cookies();
  const checkoutDataRaw = cookieStore.get("hk-checkout-data")?.value;

  let storedData: StoredCheckoutData = {};
  if (checkoutDataRaw) {
    try {
      storedData = JSON.parse(
        decodeURIComponent(checkoutDataRaw),
      ) as StoredCheckoutData;
    } catch {
      /* ignore malformed cookie */
    }
  }

  const billingEmailFromCookie = storedData.email;

  // Fetch order first — needed for status gate and render.
  // Draft orders (checkout-draft) return 401 from the WooCommerce REST API;
  // when that happens with a sessionId present (payment confirmed), we defer
  // to the session-based processing path below which will transition the order
  // out of draft and then redirect to a clean URL where it becomes readable.
  let order: Awaited<ReturnType<typeof getOrderAction>> = null;
  let orderFetchFailed = false;
  try {
    order = await getOrderAction(orderId, orderKey, billingEmailFromCookie);
  } catch (orderErr) {
    const msg = orderErr instanceof Error ? orderErr.message : "";
    if (
      msg.includes("Invalid order") ||
      msg.includes("invalid_order") ||
      msg.includes("Invalid order ID or key") ||
      msg.includes("not found")
    ) {
      redirect("/checkout?reason=order_expired");
    }
    // Draft orders return 401/cannot_view — defer to session processing below.
    // When no sessionId is present (e.g. redirect after processCheckoutOrderAction
    // or direct navigation) we still surface a fallback rather than crashing.
    const isDraftError =
      msg.includes("cannot_view") || msg.includes("status 401");
    if (isDraftError) {
      orderFetchFailed = true;
    } else {
      throw orderErr;
    }
  }
  if (!order && !orderFetchFailed) return notFound();

  let effectiveOrderId = orderId;
  let effectiveOrderKey = orderKey;
  let billingEmail: string | undefined = billingEmailFromCookie;
  let paymentCardBrand: string | undefined;
  let paymentCardLast4: string | undefined;
  let paymentMethod: string | undefined;
  let paymentWalletType: string | undefined;

  if (sessionId) {
    let session: Awaited<ReturnType<typeof getCheckoutSessionAction>> | null =
      null;
    try {
      session = await getCheckoutSessionAction(sessionId);
    } catch {
      // Session fetch failed — continue with URL params
    }

    if (session) {
      // ENG-789: the backend rewrites the Stripe return_url to this
      // order-based URL once the draft order exists, so redirect-BNPL
      // failures (e.g. Afterpay "Fail test payment") land HERE — not on
      // /checkout/success. Mirror its status branching instead of 404ing:
      // - open    → payment failed/canceled; cart + draft order are intact,
      //             send the shopper back to checkout for an in-place retry.
      // - expired → session no longer payable.
      // - complete + unpaid → async method still settling; show pending UI,
      //             the webhook (async_payment_succeeded) finalizes the order.
      if (session.status === "open") {
        redirect("/checkout?error=payment_failed");
      }
      if (session.status === "expired") {
        // ENG-784: deliberate cart-changed expiry (mechanism 1 fired during a
        // BNPL redirect) → back to /checkout with the cart-changed banner
        // (cart intact, fresh session minted on load). Plain expiry keeps the
        // session_expired error page.
        if (session.expiredReason === "cart_changed") {
          redirect("/checkout?error=cart_changed");
        }
        redirect("/checkout/error?reason=session_expired");
      }
      if (session.paymentStatus === "unpaid") {
        // ENG-784: sessionId enables the client poller (poll-only, D4).
        return <PaymentProcessing sessionId={sessionId} />;
      }

      // Guard: session order must match URL (reject tampered requests).
      // Skip the deferred sentinel "0": in the WC 10.8 deferred-order flow the
      // session metadata order_id stays "0" when the SUCCESS PAGE (not the
      // webhook) wins the create race — it creates the real order but does not
      // write order_id back to the session metadata. "0" is not a real order to
      // compare against, so it must not trip the tamper check (was 404ing valid
      // orders).
      if (
        session.orderId &&
        session.orderId !== "0" &&
        session.orderId !== orderId
      ) {
        return notFound();
      }

      billingEmail =
        billingEmailFromCookie ?? session.customerEmail ?? undefined;
      paymentCardBrand = session.cardBrand ?? undefined;
      paymentCardLast4 = session.cardLast4 ?? undefined;
      paymentMethod = session.paymentMethod ?? undefined;
      paymentWalletType = session.walletType ?? undefined;

      if (session.orderId && session.orderKey) {
        effectiveOrderId = session.orderId;
        effectiveOrderKey = session.orderKey;
      }

      // When the order is still a draft (orderFetchFailed), treat it as needing
      // processing — the 401 from the REST API confirms it hasn't been processed yet.
      const needsProcessing =
        orderFetchFailed ||
        needsCheckoutOrderProcessing(
          order?.status ?? "checkout-draft",
          session.cartToken,
          session.orderId,
          session.orderKey,
        );

      if (needsProcessing) {
        // ENG-801: carry billing and shipping SEPARATELY. The hk-checkout-data
        // cookie holds a SHIPPING address and must only feed shippingAddress
        // (precedence: cookie, then session shipping_details, then billing
        // fallback). Billing comes from the checkout-written hk-billing-address
        // cookie first — the session's customer_details is STALE for up to
        // tens of seconds after updateBillingAddress()/confirm(), so it is
        // only the fallback (wallet/express flows write no billing cookie).
        const billingCookie = parseBillingAddressCookie(
          cookieStore.get(BILLING_ADDRESS_COOKIE)?.value,
        );
        // Bounded re-poll only when NO billing cookie and the session has no
        // billing at all (e.g. wallet flows).
        let sessionAddr = session;
        if (!billingCookie && !sessionAddr.billingAddress?.address1) {
          for (let attempt = 0; attempt < 6; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            try {
              const refreshed = await getCheckoutSessionAction(sessionId);
              if (refreshed.billingAddress?.address1) {
                sessionAddr = refreshed;
                break;
              }
            } catch {
              /* transient — keep polling */
            }
          }
        }
        const cookie = storedData.shippingAddress;
        const shippingSource =
          cookie ??
          sessionAddr.shippingAddress ??
          sessionAddr.billingAddress ??
          null;
        const billingSource =
          billingCookie ?? sessionAddr.billingAddress ?? shippingSource;

        const billingAddress = billingSource
          ? {
              firstName: billingSource.firstName ?? "",
              lastName: billingSource.lastName ?? "",
              address1: billingSource.address1 ?? "",
              ...(billingSource.address2
                ? { address2: billingSource.address2 }
                : {}),
              city: billingSource.city ?? "",
              state: billingSource.state ?? "",
              postcode: billingSource.postcode ?? "",
              country: billingSource.country ?? "",
              email: billingEmail ?? "",
              ...(billingSource.phone ? { phone: billingSource.phone } : {}),
            }
          : {
              firstName: "",
              lastName: "",
              address1: "",
              city: "",
              state: "",
              postcode: "",
              country: "",
              email: billingEmail ?? "",
              phone: "",
            };

        const shippingAddress = shippingSource
          ? {
              firstName: shippingSource.firstName ?? "",
              lastName: shippingSource.lastName ?? "",
              address1: shippingSource.address1 ?? "",
              ...(shippingSource.address2
                ? { address2: shippingSource.address2 }
                : {}),
              city: shippingSource.city ?? "",
              state: shippingSource.state ?? "",
              postcode: shippingSource.postcode ?? "",
              country: shippingSource.country ?? "",
              ...(shippingSource.phone ? { phone: shippingSource.phone } : {}),
            }
          : {
              firstName: "",
              lastName: "",
              address1: "",
              city: "",
              state: "",
              postcode: "",
              country: "",
              phone: "",
            };

        const paymentData = [
          { key: "checkout_session_id", value: sessionId },
          { key: "payment_status", value: "paid" },
          { key: "payment_intent_id", value: session.paymentIntentId ?? "" },
          { key: "payment_method", value: session.paymentMethod ?? "card" },
          { key: "payment_mode", value: session.livemode ? "live" : "test" },
          { key: "payment_provider", value: "stripe" },
          { key: "card_brand", value: session.cardBrand ?? "" },
          { key: "card_last4", value: session.cardLast4 ?? "" },
          { key: "wallet_type", value: session.walletType ?? "" },
        ];
        if (session.stripeCustomerId) {
          paymentData.push({
            key: "stripe_customer_id",
            value: session.stripeCustomerId,
          });
        }

        try {
          await processCheckoutOrderAction(
            session.cartToken as string,
            // Use the URL-derived order id/key (always valid — validated at the
            // top of the page), NOT session.orderId/orderKey which stay "0"/null
            // in the WC 10.8 deferred flow when the SUCCESS page won the create
            // race (the webhook never wrote them back). Passing null crashed the
            // finalize with a GraphQL non-null violation (KNOWN BUG).
            effectiveOrderId,
            effectiveOrderKey,
            {
              orderKey: effectiveOrderKey,
              billingAddress,
              shippingAddress,
              ...(billingEmail ? { billingEmail } : {}),
              paymentMethod: "headkit-payments",
              paymentData,
            },
          );
        } catch (orderErr) {
          const msg = orderErr instanceof Error ? orderErr.message : "";
          if (
            msg.includes("order expired") ||
            msg.includes("not found") ||
            msg.includes("Invalid order")
          ) {
            redirect("/checkout?reason=order_expired");
          }
          // We are on the return page AFTER a successful charge, with a valid
          // order URL — the order already exists. The bare /checkout/success
          // route or the Stripe webhook may have ALREADY finalized it, so a
          // re-finalize here fails with an ownership / already-paid error. That
          // is NOT a checkout failure: fall through to the confirmation render
          // instead of crashing to the error boundary (KNOWN BUG,
          // checkout-purchase.spec.ts ~L263). Genuinely unexpected errors still
          // surface.
          const alreadyFinalized =
            msg.includes("different customer") ||
            msg.includes("invalid_user") ||
            msg.includes("already paid") ||
            msg.includes("cannot be paid") ||
            msg.includes("must not be null");
          if (!alreadyFinalized) throw orderErr;
        }
        // Success OR already-finalized → route to the clean confirmation URL
        // (no session_id) for the deterministic order render. Kept OUTSIDE the
        // try/catch: redirect() signals via a thrown NEXT_REDIRECT and a catch
        // around it would swallow the navigation (the ISSUE-001 trap).
        redirect(
          `/checkout/success/${String(effectiveOrderId || orderId)}?key=${encodeURIComponent(String(effectiveOrderKey || orderKey))}`,
        );
      }
    }
  }

  if (!order) {
    if (orderFetchFailed) {
      // Order is still transitioning (checkout-draft) or credentials are restricted —
      // show a minimal confirmation so the user isn't left with a crash.
      return (
        <>
          <ClearCart />
          <div className="mt-5 px-5 md:px-10">
            <h1 className="font-bold text-3xl mb-[10px] text-primary">
              Your order is confirmed.
            </h1>
            <p className="text-lg">
              Order <span className="font-bold">#{orderId}</span> has been
              received. You will receive a confirmation email shortly.
            </p>
            <div className="mt-8">
              <Link
                href="/"
                className="inline-block rounded-lg bg-primary px-6 py-2.5 text-center text-sm font-medium text-on-primary hover:opacity-80"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </>
      );
    }
    return notFound();
  }

  const currency = order.currency.code;
  const billing = order.billingAddress;
  const shipping = order.shippingAddress;
  const shippingLines = order.shippingLines ?? [];

  const shippingCost =
    getFloatVal(order.totals.totalShipping) +
    getFloatVal(order.totals.totalShippingTax);

  // Click & Collect: WooCommerce copies the billing address into the order's
  // shipping fields even for pickup, but native Woo hides that address and shows
  // the pickup location instead (ShippingController: woocommerce_order_hide_shipping_address
  // + woocommerce_order_shipping_to_display). Mirror that here — suppress the
  // customer address on pickup orders and render the store collection address.
  const isPickupLine = (methodId: string) =>
    methodId === "pickup_location" || methodId === "local_pickup";
  const isPickupOrder = shippingLines.some((l) => isPickupLine(l.methodId));

  const hasShippingMethod = shippingLines.length > 0;
  const hasShippingAddress =
    !isPickupOrder &&
    !!(
      shipping?.address1?.trim() ||
      (shipping?.city?.trim() && shipping?.country?.trim())
    );
  const showShippingSection = hasShippingMethod || hasShippingAddress;

  return (
    <>
      <ClearCart />
      <div className="grid grid-cols-12 gap-x-1 gap-y-5 md:gap-8 mt-5 px-5 md:px-10">
        {/* Heading */}
        <div className="col-span-12 w-full">
          <h1 className="font-bold text-3xl mb-[10px] text-primary">
            Thanks, {billing.firstName || shipping.firstName}!
          </h1>
        </div>

        {/* Left column — order info */}
        <div className="col-span-12 md:col-span-7 grid grid-cols-7">
          <div className="col-span-12 md:col-start-1 md:col-span-5">
            <div className="mb-10">
              <p className="font-extrabold text-3xl">
                Your order is confirmed.
              </p>
              <p className="text-lg">
                You will receive a confirmation email shortly.
              </p>
              <br />
              <p className="font-bold text-2xl">Order #{order.orderNumber}</p>
            </div>

            <div className="text-xl">
              {/* Contact */}
              <div className="grid grid-cols-4 md:grid-cols-3 mb-5 items-baseline gap-1 md:gap-4 font-medium text-lg mt-[8px]">
                <div className="col-span-1">
                  <div className="font-extrabold">Contact</div>
                </div>
                <div className="col-span-3 md:col-span-2">{billing.email}</div>
              </div>

              {/* Shipping — consolidated address + method */}
              {showShippingSection && (
                <div className="grid grid-cols-4 md:grid-cols-3 mb-5 items-baseline gap-1 md:gap-4 font-medium text-lg mt-[8px]">
                  <div className="col-span-1">
                    <div className="font-extrabold">
                      {isPickupOrder ? "Pickup" : "Shipping"}
                    </div>
                  </div>
                  <div className="col-span-3 md:col-span-2 space-y-1">
                    {hasShippingMethod && (
                      <>
                        {shippingLines.map((line, i) => (
                          <div key={i}>
                            <div>
                              {line.methodTitle} /{" "}
                              {getFloatVal(line.total) === 0
                                ? "Free"
                                : formatPrice(
                                    getFloatVal(line.total),
                                    currency,
                                  )}
                            </div>
                            {isPickupLine(line.methodId) &&
                              (line.pickupAddress || line.pickupDetails) && (
                                <div className="mt-1 text-base text-gray-600">
                                  {line.pickupAddress && (
                                    <div>{line.pickupAddress}</div>
                                  )}
                                  {line.pickupDetails && (
                                    <div className="text-sm">
                                      {line.pickupDetails}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                      </>
                    )}
                    {hasShippingAddress && (
                      <div className="mt-2">
                        {shipping?.firstName} {shipping?.lastName}
                        <br />
                        {shipping?.address1}
                        <br />
                        {shipping?.address2 && (
                          <>
                            {shipping.address2}
                            <br />
                          </>
                        )}
                        {shipping?.city} {shipping?.state} {shipping?.postcode}
                        <br />
                        {shipping?.country}
                        {shipping?.phone && (
                          <>
                            <br />
                            {shipping.phone}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Billing address */}
              <div className="grid grid-cols-4 md:grid-cols-3 mb-5 items-baseline gap-1 md:gap-4 font-medium text-lg mt-[8px]">
                <div className="col-span-1">
                  <div className="font-extrabold">Billing Address</div>
                </div>
                <div className="col-span-3 md:col-span-2">
                  {billing.firstName} {billing.lastName}
                  <br />
                  {billing.address1}
                  <br />
                  {billing.address2 && (
                    <>
                      {billing.address2}
                      <br />
                    </>
                  )}
                  {billing.city} {billing.state} {billing.postcode}
                  <br />
                  {billing.country}
                  <br />
                  {billing.phone}
                </div>
              </div>

              {/* Payment */}
              <div className="grid grid-cols-4 md:grid-cols-3 mb-5 items-baseline gap-1 md:gap-4 font-medium text-lg mt-[8px]">
                <div className="col-span-1">
                  <div className="font-extrabold">Payment</div>
                </div>
                <div className="col-span-3 md:col-span-2">
                  {formatPrice(getFloatVal(order.totals.totalPrice), currency)}
                  <br />
                  <PaymentMethodDisplay
                    cardBrand={paymentCardBrand}
                    cardLast4={paymentCardLast4}
                    paymentMethod={paymentMethod}
                    walletType={paymentWalletType}
                    paymentMethodTitle={order.paymentMethodTitle}
                    fallback={order.status}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-8 md:flex-row">
              <Link
                href="/"
                className="inline-block rounded-lg bg-primary px-6 py-2.5 text-center text-sm font-medium text-on-primary hover:opacity-80"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>

        {/* Right column — line items + totals */}
        <div className="col-span-12 md:col-span-4">
          <div className="space-y-[20px] mb-10">
            {order.items.map((item, i) => (
              <LineItemDisplay
                key={i}
                name={item.name}
                images={item.images}
                variation={item.variation ?? []}
                quantity={item.quantity}
                lineSubtotal={
                  item.totals?.lineSubtotal ??
                  item.totals?.lineTotal ??
                  item.prices?.price ??
                  "0"
                }
                currency={currency}
                giftCard={item.giftCard ?? null}
              />
            ))}
          </div>

          {/* Totals */}
          <div className="flex gap-4 justify-between font-medium">
            <p>Subtotal</p>
            <p>{formatPrice(getFloatVal(order.totals.totalItems), currency)}</p>
          </div>

          {getFloatVal(order.totals.totalDiscount) > 0 && (
            <div className="flex gap-4 justify-between font-medium mt-[8px]">
              <p>Discount</p>
              <p>
                −
                {formatPrice(getFloatVal(order.totals.totalDiscount), currency)}
              </p>
            </div>
          )}

          <div className="flex gap-4 justify-between font-medium mt-[8px]">
            <p>Shipping</p>
            <p>
              {shippingCost === 0
                ? "Free"
                : formatPrice(shippingCost, currency)}
            </p>
          </div>

          {getFloatVal(order.totals.totalTax) > 0 && (
            <div className="flex gap-4 justify-between font-medium mt-[8px]">
              <p>Tax</p>
              <p>{formatPrice(getFloatVal(order.totals.totalTax), currency)}</p>
            </div>
          )}

          <div className="flex gap-4 justify-between text-xl mt-[20px]">
            <p className="font-medium">Total</p>
            <p className="font-medium">
              {formatPrice(getFloatVal(order.totals.totalPrice), currency)}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
