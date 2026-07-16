import { cookies } from "next/headers";

/**
 * Server-side tracking cookie for the ACTIVE Stripe Checkout Session
 * (ENG-784 mechanism 1). While this cookie is present, any cart mutation
 * outside the checkout page expires the session first (reason CART_CHANGED)
 * so a stale in-flight payment can never capture a mismatched amount.
 */
export const CHECKOUT_SESSION_COOKIE = "hk-checkout-session";

/** Cookie attributes for the active-checkout-session cookie. */
export function checkoutSessionCookieOptions(): {
  name: string;
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    name: CHECKOUT_SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 45 minutes — in lockstep with the Stripe Checkout Session `expires_at`
    // set by commerce. When the session times out on Stripe's side the cookie
    // dies with it, so expire-before-mutate never fires against a session
    // Stripe already expired.
    maxAge: 45 * 60,
  };
}

/** Read the active checkout session id, if any. */
export async function getCheckoutSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CHECKOUT_SESSION_COOKIE)?.value;
}

/**
 * Record `sessionId` as the shopper's active checkout session.
 *
 * D10 (accepted edge): this cookie holds the LATEST session only. If the
 * shopper opens checkout in two tabs, registering tab B's session overwrites
 * tab A's — a cart mutation then expires only tab B's session. Tab A's
 * orphaned session is backstopped by mechanism 2: manual capture verifies the
 * authorized amount against the authoritative cart before capturing, so the
 * unexpired stale session still cannot charge a drifted amount.
 */
export async function setCheckoutSessionCookie(
  sessionId: string,
): Promise<void> {
  const { name, ...opts } = checkoutSessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.set({ name, value: sessionId, ...opts });
}

/** Drop the active-session cookie (after expiry or session swap). */
export async function deleteCheckoutSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CHECKOUT_SESSION_COOKIE);
}
