import {
  createServerSDK,
  type ServerSDK,
  type ServerSDKOptions,
} from "@headkit/sdk/server";

/**
 * Create an SK-based SDK instance — auto-detects from HEADKIT_PRIVATE_KEY.
 * Import this ONLY in server components, server actions, route handlers, and webhooks.
 *
 * All optional tokens are passed straight to the constructor (not via the
 * `withX` builders) so no token is ever silently dropped by builder chaining
 * (RESEARCH Pitfall 4).
 *
 * @param cartToken  - Optional cart session token for cart-aware operations.
 * @param klaviyoId  - Optional Klaviyo visitor ID (__kla_id cookie) for
 *                     abandoned-cart recovery via rebuildCartFromKlaviyo.
 * @param authToken  - Optional WP JWT (hk-auth-token cookie) forwarded as
 *                     `Authorization: Bearer` so cart/checkout calls are scoped
 *                     to the logged-in WP user. Absent → guest (no Authorization).
 */
export function createServerHeadkit(
  cartToken?: string,
  klaviyoId?: string,
  authToken?: string,
): ServerSDK {
  const options: ServerSDKOptions = {
    ...(cartToken ? { cartToken } : {}),
    ...(klaviyoId ? { klaviyoId } : {}),
    ...(authToken ? { authToken } : {}),
  };
  return createServerSDK(options);
}
