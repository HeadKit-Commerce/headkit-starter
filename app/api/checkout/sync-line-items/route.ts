import { NextResponse } from "next/server";
import { getCartToken } from "@/lib/cart";
import { createServerHeadkit } from "@/lib/sdk.server";

/**
 * POST /api/checkout/sync-line-items
 *
 * Called by Stripe's runServerUpdate during checkout. Syncs WooCommerce cart
 * line items to the Stripe Checkout Session. Cart token is read from cookies.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessionId = body?.sessionId as string | undefined;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const cartToken = await getCartToken();
    if (!cartToken) {
      return NextResponse.json(
        { error: "No active cart session" },
        { status: 401 },
      );
    }

    const result =
      await createServerHeadkit(
        cartToken,
      ).payments.syncCheckoutSessionLineItems(sessionId);
    return NextResponse.json({
      ok: result.ok,
      shippingOptionMapping: result.shippingOptionMapping ?? null,
    });
  } catch (err) {
    console.error("[sync-line-items]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
