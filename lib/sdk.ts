import { createClientSDK, type ClientSDK } from "@headkit/sdk";

/**
 * PK-based SDK singleton — auto-detects from NEXT_PUBLIC_HEADKIT_PUBLIC_KEY.
 * Safe to import in client components, server components, and server actions.
 *
 * For cart-aware usage: headkit.withCartToken(token).cart.get()
 */
export const headkit: ClientSDK = createClientSDK();
