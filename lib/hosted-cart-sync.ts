/**
 * After Shopify Checkout the shopper already saw Shopify's confirmation.
 * HeadKit must drop the bag without a second thank-you page — including when
 * they close the Checkout tab and never click Continue shopping.
 *
 * Pending is set when they leave for Shopify (drawer CTA or /checkout
 * redirect). The next HeadKit getCart (tab focus, drawer mount, or this
 * silent sync) rotates the cookie once commerce sees ORDERS_PAID.
 */

export const HOSTED_CHECKOUT_COOKIE = "hk-hosted-checkout";
export const HOSTED_CHECKOUT_PENDING_KEY = "hk-hosted-checkout-pending";
export const HOSTED_CART_SYNC_RETRIES = 4;
export const HOSTED_CART_SYNC_DELAY_MS = 2000;

export function hostedCheckoutCookieOptions(): {
  name: string;
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    name: HOSTED_CHECKOUT_COOKIE,
    // Readable by HostedCartSync. Closing the Shopify tab drops
    // sessionStorage; the next HeadKit visit still has to know to rotate.
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  };
}

export function markHostedCheckoutPending(): void {
  try {
    sessionStorage.setItem(HOSTED_CHECKOUT_PENDING_KEY, "1");
  } catch {
    // Private mode / non-browser — cookie path still covers /checkout.
  }
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${HOSTED_CHECKOUT_COOKIE}=1; path=/; max-age=86400; samesite=lax`;
}

export function clearHostedCheckoutPending(): void {
  try {
    sessionStorage.removeItem(HOSTED_CHECKOUT_PENDING_KEY);
  } catch {
    // ignore
  }
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${HOSTED_CHECKOUT_COOKIE}=; path=/; max-age=0`;
}

function cookieIsPending(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split(";").some((part) => {
    const [name, value] = part.trim().split("=");
    return name === HOSTED_CHECKOUT_COOKIE && value === "1";
  });
}

export function isHostedCheckoutPending(): boolean {
  try {
    if (sessionStorage.getItem(HOSTED_CHECKOUT_PENDING_KEY) === "1") {
      return true;
    }
  } catch {
    // ignore
  }
  return cookieIsPending();
}

export function shouldClearHostedCheckoutPending(
  cart: { itemsCount?: number } | null,
): boolean {
  return cart != null && (cart.itemsCount ?? 0) === 0;
}
