import type { cookies } from "next/headers";

/**
 * Name of the non-httpOnly cookie holding the WP JWT (set by auth-context.tsx).
 * Server-readable by design so server actions can forward it to the SDK as
 * `Authorization: Bearer`. Centralized here so the cart and checkout server
 * actions share a single literal (no divergent copies of the cookie name).
 */
export const AUTH_TOKEN_COOKIE = "hk-auth-token";

/**
 * Read the WP JWT from the `hk-auth-token` cookie. Forwarded to the SDK as
 * `Authorization: Bearer` so cart/checkout calls are user-scoped. Never logged
 * (T-04.1-11 / T-04.1-15). Absent → `undefined` → guest path unchanged.
 */
export function getAuthToken(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string | undefined {
  return cookieStore.get(AUTH_TOKEN_COOKIE)?.value ?? undefined;
}
