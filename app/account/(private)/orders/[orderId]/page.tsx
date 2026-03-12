import Link from "next/link";
import { getOrderAction } from "@/app/checkout/actions";
import { LineItemDisplay } from "@/components/checkout/line-item-display";
import type { StoreOrder } from "@/app/checkout/actions";
import { getFloatVal, formatPrice } from "@/lib/utils";

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

export default async function Page({ params, searchParams }: Props) {
  const { orderId } = await params;
  const { key: orderKey } = await searchParams;

  if (!orderId) {
    return (
      <div className="max-w-4xl">
        <p className="text-gray-500">Order not found.</p>
        <Link
          href="/account/orders"
          className="text-primary hover:underline mt-4 block"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  if (!orderKey) {
    return (
      <div className="max-w-4xl">
        <p className="text-gray-500">
          Please open this order from your orders list to view details.
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

  let order: StoreOrder | null = null;
  try {
    order = await getOrderAction(orderId, orderKey);
  } catch {
    order = null;
  }

  if (!order) {
    return (
      <div className="max-w-4xl">
        <p className="text-gray-500">Order not found.</p>
        <Link
          href="/account/orders"
          className="text-primary hover:underline mt-4 block"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  const displayId = order.databaseId ?? order.id ?? orderId;
  const currency = order.currency?.code ?? "USD";
  const shippingCost =
    order.totals != null
      ? getFloatVal(order.totals.totalShipping) +
        getFloatVal(order.totals.totalShippingTax)
      : 0;

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

      {(order.shippingAddress ?? order.billingAddress) && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {order.shippingAddress && (
              <div>
                <h2 className="font-medium mb-4">Shipping Address</h2>
                {addr(order.shippingAddress)}
              </div>
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
