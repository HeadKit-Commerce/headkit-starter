"use server";

import { cookies } from "next/headers";
import type {
  AddToCartInput,
  CartFieldsFragment,
  UpdateCustomerInput,
  GetCartQuery,
} from "@headkit/sdk";
import { GraphQLError } from "@headkit/sdk";
import type { ServerSDK } from "@headkit/sdk/server";
import { createServerHeadkit } from "@/lib/sdk.server";
import { getCartToken, cartTokenCookieOptions } from "@/lib/cart";
import { getAuthToken } from "@/lib/auth-cookie";

export type FullCart = NonNullable<GetCartQuery["commerce"]["cart"]>;

export type AddToCartResult =
  | { success: true; cart: CartFieldsFragment }
  | { success: false; error: string };

export type CartActionResult =
  | { success: true; cart: CartFieldsFragment }
  | { success: false; error: string };

/**
 * Execute a cart mutation with automatic retry on expired/invalid tokens.
 * First attempt uses the existing cookie token. On failure, clears the
 * stale cookie and retries without a token so the backend mints a fresh session.
 */
const decodeTokenUserId = (token: string): string | null => {
  try {
    return JSON.parse(atob(token.split(".")[1] ?? "")).user_id ?? null;
  } catch {
    return null;
  }
};

const isTokenExpiringSoon = (
  token: string,
  thresholdSeconds = 3600,
): boolean => {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1] ?? ""));
    return exp - Date.now() / 1000 < thresholdSeconds;
  } catch {
    return true;
  }
};

function getKlaviyoId(cookieStore: Awaited<ReturnType<typeof cookies>>): string | undefined {
  return cookieStore.get("__kla_id")?.value ?? undefined;
}

// getAuthToken (reads the `hk-auth-token` cookie, forwarded as
// `Authorization: Bearer`) is shared from `@/lib/auth-cookie` so the cart and
// checkout server actions use a single cookie-name literal (no divergence).

async function withCartRetry(
  operation: (sdk: ServerSDK) => Promise<CartFieldsFragment>,
): Promise<CartFieldsFragment> {
  const cartToken = await getCartToken();
  const { name: cookieName, ...cookieOpts } = cartTokenCookieOptions();
  const cookieStore = await cookies();
  const klaviyoId = getKlaviyoId(cookieStore);
  const authToken = getAuthToken(cookieStore);

  const persistToken = (newToken: string) => {
    if (!newToken) return;
    // Skip write if same user identity AND current token is not expiring soon
    const sameUser =
      decodeTokenUserId(newToken) === decodeTokenUserId(cartToken ?? "");
    const needsRefresh = !cartToken || isTokenExpiringSoon(cartToken);
    if (!sameUser || needsRefresh) {
      cookieStore.set({ name: cookieName, value: newToken, ...cookieOpts });
    }
  };

  const isSessionError = (err: unknown): boolean =>
    err instanceof GraphQLError &&
    (err.hasCode("CART_SESSION_EXPIRED") || err.hasCode("CART_NOT_FOUND"));

  try {
    const result = await operation(
      createServerHeadkit(cartToken, klaviyoId, authToken),
    );
    persistToken(result.token);
    return result;
  } catch (err) {
    // Only retry on session errors. For any other error (stock, validation,
    // network) propagate immediately so the caller surfaces a real message.
    if (!isSessionError(err)) throw err;

    // Clear the stale cookie (if any) and retry with a fresh session.
    cookieStore.delete(cookieName);
    const result = await operation(
      createServerHeadkit(undefined, klaviyoId, authToken),
    );
    persistToken(result.token);
    return result;
  }
}

export async function getCartAction(): Promise<CartFieldsFragment | null> {
  try {
    const cartToken = await getCartToken();
    if (!cartToken) return null;
    const cookieStore = await cookies();
    const authToken = getAuthToken(cookieStore);
    const cart = await createServerHeadkit(
      cartToken,
      undefined,
      authToken,
    ).cart.get();
    return cart as unknown as CartFieldsFragment;
  } catch {
    return null;
  }
}

export async function getFullCartAction(): Promise<FullCart | null> {
  const cartToken = await getCartToken();
  if (!cartToken) {
    console.error("[getFullCartAction] no cart token cookie → session_expired");
    return null;
  }
  try {
    const cookieStore = await cookies();
    const authToken = getAuthToken(cookieStore);
    return await createServerHeadkit(cartToken, undefined, authToken).cart.get();
  } catch (err) {
    const code = err instanceof GraphQLError ? err.message : String(err);
    console.error("[getFullCartAction] cart.get() failed → session_expired", {
      tokenUserId: decodeTokenUserId(cartToken),
      error: code,
    });
    return null;
  }
}

export async function addToCartAction(
  input: AddToCartInput,
): Promise<AddToCartResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.addItem(input));
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add to cart";
    return { success: false, error: message };
  }
}

export async function removeCartItemAction(
  key: string,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.removeItem(key));
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove cart item";
    return { success: false, error: message };
  }
}

export async function updateCartItemAction(
  key: string,
  quantity: number,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) =>
      sdk.cart.updateItem({ key, quantity }),
    );
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update cart item";
    return { success: false, error: message };
  }
}

export async function applyCouponAction(
  code: string,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.applyCoupon(code));
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to apply coupon";
    return { success: false, error: message };
  }
}

export async function applyGiftCardAction(
  code: string,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.applyGiftCard(code));
    return { success: true, cart };
  } catch (err) {
    // The gift-cards plugin surfaces invalid-code / non-19-char failures as a
    // UserError; propagate its message verbatim. Never log the code (T-09-03).
    const message =
      err instanceof Error ? err.message : "Failed to apply gift card";
    return { success: false, error: message };
  }
}

export async function removeCouponAction(
  code: string,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.removeCoupon(code));
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove coupon";
    return { success: false, error: message };
  }
}

export async function selectShippingAction(
  packageId: string,
  rateId: string,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) =>
      sdk.cart.selectShipping(packageId, rateId),
    );
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to select shipping";
    return { success: false, error: message };
  }
}

export async function updateCustomerAddressAction(
  input: UpdateCustomerInput,
): Promise<CartActionResult> {
  try {
    const cart = await withCartRetry((sdk) => sdk.cart.updateCustomer(input));
    return { success: true, cart };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update customer";
    return { success: false, error: message };
  }
}

/**
 * Delete the httpOnly `hk-cart-token` cookie. Called from signOut
 * (auth-context.tsx): the WP theme resolves the WP user from the Cart-Token
 * itself (session identity unification — see
 * .planning/debug/stripe-shipping-desync-logged-in.md), so a cart token left
 * behind after logout would keep every wc/store request acting as the
 * logged-out user. A fresh guest cart token is minted automatically by the
 * backend on the next cart operation.
 */
export async function clearCartTokenAction(): Promise<void> {
  const { name: cookieName } = cartTokenCookieOptions();
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
