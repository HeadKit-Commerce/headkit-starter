import { createServerSDK, type ServerSDK } from "@headkit/sdk/server";

/**
 * Create an SK-based SDK instance — auto-detects from HEADKIT_PRIVATE_KEY.
 * Import this ONLY in server components, server actions, route handlers, and webhooks.
 *
 * @param cartToken  - Optional cart session token for cart-aware operations.
 * @param klaviyoId  - Optional Klaviyo visitor ID (__kla_id cookie) for
 *                     abandoned-cart recovery via rebuildCartFromKlaviyo.
 */
export function createServerHeadkit(
  cartToken?: string,
  klaviyoId?: string,
): ServerSDK {
  let sdk = createServerSDK();
  if (cartToken) sdk = sdk.withCartToken(cartToken);
  if (klaviyoId) sdk = sdk.withKlaviyoId(klaviyoId);
  return sdk;
}
