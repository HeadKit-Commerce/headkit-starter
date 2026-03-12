import { redirect } from "next/navigation";
import { getCheckoutSessionAction } from "../actions";

/**
 * Legacy success entry: when user lands with only session_id (e.g. old bookmark
 * or successBaseUrl not set), fetch session to get orderId/orderKey and redirect
 * to the order-based URL.
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
    const orderId = session.orderId;
    const orderKey = session.orderKey;

    if (orderId && orderKey) {
      redirect(
        `/checkout/success/${orderId}?key=${encodeURIComponent(orderKey)}&session_id=${encodeURIComponent(sessionId)}`,
      );
    }
  } catch {
    /* Session fetch failed */
  }

  redirect("/");
}
