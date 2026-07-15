import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCartToken } from "@/lib/cart";
import { getAuthToken } from "@/lib/auth-cookie";
import { createServerHeadkit } from "@/lib/sdk.server";

/**
 * POST /api/checkout/sync-line-items
 *
 * Called by Stripe's runServerUpdate during checkout. Syncs WooCommerce cart
 * line items to the Stripe Checkout Session. Cart token is read from cookies.
 *
 * The hk-auth-token cookie is forwarded as authToken so the underlying
 * GetCart is AUTH-flavored: WC flavor-locks the session customer blob to the
 * request's WP user, so a token-only read of a logged-in shopper's session
 * would see (and destructively persist) the guest flavor — pushing the
 * default-zone shipping rate to Stripe instead of the shopper's selection.
 * Mechanism: .planning/debug/stripe-shipping-desync-logged-in.md
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

    const authToken = getAuthToken(await cookies());
    const result = await createServerHeadkit(
      cartToken,
      undefined,
      authToken,
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
