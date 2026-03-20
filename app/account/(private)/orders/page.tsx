import Link from "next/link";
import { Button } from "@/components/ui/button";
import { headkit } from "@/lib/sdk";
import type { GetOrdersQuery } from "@headkit/sdk";
import { cookies } from "next/headers";

type OrderItem = GetOrdersQuery["commerce"]["orders"]["orders"][number];

export default async function Page() {
  const token = (await cookies()).get("hk-auth-token")?.value ?? "";

  let orders: OrderItem[] = [];
  let error: string | null = null;

  try {
    const result = await headkit.orders.listOrders(token, 1, 50);
    orders = result.orders;
  } catch {
    error = "Failed to load orders. Please try again later.";
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">My Orders</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">My Orders</h1>
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-500 mb-4">
            You haven&apos;t placed any orders yet.
          </p>
          <Button asChild>
            <Link href="/shop">Start Shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      <div className="space-y-4">
        {orders.map((order) => {
          const href =
            order.orderKey != null
              ? `/account/orders/${order.databaseId}?key=${encodeURIComponent(order.orderKey)}`
              : `/account/orders/${order.databaseId}`;
          return (
            <Link
              key={order.databaseId}
              href={href}
              className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">Order #{order.databaseId}</p>
                  <p className="text-sm text-gray-500">
                    {order.date
                      ? new Date(order.date).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{order.total}</p>
                  <p className="text-sm text-gray-500">{order.status}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
