import { createServerSDK, type ServerSDK } from "@headkit/sdk/server";

/**
 * Create an SK-based SDK instance — auto-detects from HEADKIT_PRIVATE_KEY.
 * Import this ONLY in server components, server actions, route handlers, and webhooks.
 *
 * @param cartToken - Optional cart session token for cart-aware operations.
 */
export function createServerHeadkit(cartToken?: string): ServerSDK {
  const sdk = createServerSDK();
  return cartToken ? sdk.withCartToken(cartToken) : sdk;
}
