import Link from "next/link";
import { getOrderAction } from "@/app/checkout/actions";
import { LineItemDisplay } from "@/components/checkout/line-item-display";
import type { StoreOrder } from "@/app/checkout/actions";
import { getFloatVal, formatPrice, getStoreCurrency } from "@/lib/utils";

interface Props {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ key?: string }>;
}

function addr(a: StoreOrder["billingAddress"] | StoreOrder["shippingAddress"]) {
  if (!a) return null;
  return (
    <address className="text-gray-600 not-italic">
      {a.firstName} {a.lastName}
      <br />
      {a.address1}
      <br />
      {a.address2 && (
        <>
          {a.address2}
          <br />
        </>
      )}
      {a.city}, {a.state} {a.postcode}
      <br />
      {a.country}
    </address>
  );
}

/**
 * IDOR-safe failure view (T-03-O2 / T-03-O3, FE-07, D-03).
 *
 * Every guest-order failure case — missing order id, missing `?key=`, wrong
 * key, or order-not-found — renders the SAME message. This prevents an
 * order-existence oracle: a caller can never distinguish "wrong key" from
 * "no such order" from the copy. Never reveal whether an order exists.
 */
function OrderUnavailable() {
  return (
    <div className="max-w-4xl">
      <p className="text-gray-500">
        This order link is invalid or has expired. Check the link in your
        confirmation email, or contact support.
      </p>
      <Link
        href="/account/orders"
        className="text-primary hover:underline mt-4 block"
      >
        Back to orders
      </Link>
    </div>
  );
}

export default async function Page({ params, searchParams }: Props) {
  const { orderId } = await params;
  const { key: orderKey } = await searchParams;

  // Key-gate (D-03): the page refuses to resolve without both the id and the
  // emailed order key. Missing either yields the same IDOR-safe view as a
  // wrong key or a non-existent order.
  if (!orderId || !orderKey) {
    return <OrderUnavailable />;
  }

  let order: StoreOrder | null = null;
  try {
    order = await getOrderAction(orderId, orderKey);
  } catch {
    order = null;
  }

  if (!order) {
    return <OrderUnavailable />;
  }

  const displayId = order.databaseId ?? order.id ?? orderId;
  const currency = order.currency?.code ?? getStoreCurrency();
  const shippingCost =
    order.totals != null
      ? getFloatVal(order.totals.totalShipping) +
        getFloatVal(order.totals.totalShippingTax)
      : 0;

  // Click & Collect: mirror native Woo — hide the (billing-copied) shipping
  // address for pickup orders and show the store collection address instead.
  const shippingLines = order.shippingLines ?? [];
  const pickupLine = shippingLines.find(
    (l) => l.methodId === "pickup_location" || l.methodId === "local_pickup",
  );
  const isPickupOrder = !!pickupLine;

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link
          href="/account/orders"
          className="text-sm text-primary hover:underline"
        >
          ← Back to orders
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Order #{displayId}</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h2 className="font-medium mb-2">Order Date</h2>
            <p className="text-gray-600">
              {order.date ? new Date(order.date).toLocaleDateString() : "—"}
            </p>
          </div>
          <div>
            <h2 className="font-medium mb-2">Status</h2>
            <p className="text-gray-600">{order.status ?? "—"}</p>
          </div>
          <div>
            <h2 className="font-medium mb-2">Total</h2>
            <p className="text-gray-600">
              {order.totals?.totalPrice != null
                ? formatPrice(getFloatVal(order.totals.totalPrice), currency)
                : (order.total ?? "—")}
            </p>
          </div>
          <div>
            <h2 className="font-medium mb-2">Payment Method</h2>
            <p className="text-gray-600">{order.paymentMethodTitle ?? "—"}</p>
          </div>
        </div>
      </div>

      {order.items && order.items.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="font-medium mb-4">Order Items</h2>
          <div className="space-y-[20px]">
            {order.items.map((item, i) => (
              <LineItemDisplay
                key={item.key ?? i}
                name={item.name ?? "Product"}
                images={item.images ?? []}
                variation={item.variation ?? []}
                quantity={item.quantity}
                lineSubtotal={
                  item.totals?.lineSubtotal ??
                  item.totals?.lineTotal ??
                  item.prices?.price ??
                  "0"
                }
                currency={currency}
              />
            ))}
          </div>

          {order.totals && (
            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="flex gap-4 justify-between font-medium">
                <p>Subtotal</p>
                <p>
                  {formatPrice(getFloatVal(order.totals.totalItems), currency)}
                </p>
              </div>
              {getFloatVal(order.totals.totalDiscount) > 0 && (
                <div className="flex gap-4 justify-between font-medium">
                  <p>Discount</p>
                  <p>
                    −
                    {formatPrice(
                      getFloatVal(order.totals.totalDiscount),
                      currency,
                    )}
                  </p>
                </div>
              )}
              <div className="flex gap-4 justify-between font-medium">
                <p>Shipping</p>
                <p>
                  {shippingCost === 0
                    ? "Free"
                    : formatPrice(shippingCost, currency)}
                </p>
              </div>
              {getFloatVal(order.totals.totalTax) > 0 && (
                <div className="flex gap-4 justify-between font-medium">
                  <p>Tax</p>
                  <p>
                    {formatPrice(getFloatVal(order.totals.totalTax), currency)}
                  </p>
                </div>
              )}
              <div className="flex gap-4 justify-between text-xl font-medium pt-2">
                <p>Total</p>
                <p>
                  {formatPrice(getFloatVal(order.totals.totalPrice), currency)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {(isPickupOrder || order.shippingAddress || order.billingAddress) && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isPickupOrder ? (
              <div>
                <h2 className="font-medium mb-4">Pickup</h2>
                <p className="text-gray-600">
                  {pickupLine?.pickupLocation ?? pickupLine?.methodTitle}
                </p>
                {pickupLine?.pickupAddress && (
                  <p className="text-gray-600">{pickupLine.pickupAddress}</p>
                )}
                {pickupLine?.pickupDetails && (
                  <p className="text-sm text-gray-500 mt-1">
                    {pickupLine.pickupDetails}
                  </p>
                )}
              </div>
            ) : (
              order.shippingAddress && (
                <div>
                  <h2 className="font-medium mb-4">Shipping Address</h2>
                  {addr(order.shippingAddress)}
                </div>
              )
            )}
            {order.billingAddress && (
              <div>
                <h2 className="font-medium mb-4">Billing Address</h2>
                {addr(order.billingAddress)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
