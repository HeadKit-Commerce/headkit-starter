/** Minimal structural shape the checkout-email resolver reads from a cart. */
export interface CheckoutEmailCart {
  billingAddress?: { email?: string | null | undefined } | null | undefined;
}

/**
 * Pure, node-testable resolver for the checkout email (Layer 4b, CKA-04).
 *
 * The recreated Stripe Checkout Session must carry a real `customer_email` so
 * the ContactDetailsElement prefills and Link initiates on load — and survives
 * a page reload (the value is baked into the server-recreated session, not
 * client state). This helper decides which email to hand
 * `createCheckoutSessionAction`.
 *
 * Precedence:
 *   1. the user-scoped cart's billing email (A1 — the authed Store API cart
 *      natively surfaces the WP user's saved billing address);
 *   2. `fallbackEmail` — a caller-derived email (e.g. `getCustomer(authToken)`)
 *      for the defensive case where the cart has no billing email;
 *   3. `undefined` — guest / no auth → `createCheckoutSessionAction` stays guest
 *      (behavior unchanged).
 *
 * Empty / whitespace-only values normalize to `undefined` so we never pass `""`
 * as an email. Pure: no I/O and no token decoding — identity is bound upstream
 * by the verified JWT (T-04.1-15); the caller derives any fallback from that
 * token (a WP JWT payload carries the user id, not the email, so the email
 * cannot be read from the token here).
 */
export function resolveCheckoutEmail(
  cart: CheckoutEmailCart | null | undefined,
  fallbackEmail?: string | null,
): string | undefined {
  const cartEmail = normalizeEmail(cart?.billingAddress?.email);
  if (cartEmail) return cartEmail;
  return normalizeEmail(fallbackEmail);
}

/** Trim to a non-empty email, or `undefined` (never an empty string). */
function normalizeEmail(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
