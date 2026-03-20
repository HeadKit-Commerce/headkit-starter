"use server";

import { cookies } from "next/headers";
import type {
  AddToCartInput,
  CartFieldsFragment,
  UpdateCustomerInput,
  GetCartQuery,
} from "@headkit/sdk";
import type { ServerSDK } from "@headkit/sdk/server";
import { createServerHeadkit } from "@/lib/sdk.server";
import { getCartToken, cartTokenCookieOptions } from "@/lib/cart";

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

async function withCartRetry(
  operation: (sdk: ServerSDK) => Promise<CartFieldsFragment>,
): Promise<CartFieldsFragment> {
  const cartToken = await getCartToken();
  const { name: cookieName, ...cookieOpts } = cartTokenCookieOptions();
  const cookieStore = await cookies();
  const klaviyoId = getKlaviyoId(cookieStore);

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

  try {
    const result = await operation(createServerHeadkit(cartToken, klaviyoId));
    persistToken(result.token);
    return result;
  } catch (err) {
    if (!cartToken) throw err;

    cookieStore.delete(cookieName);
    const result = await operation(createServerHeadkit(undefined, klaviyoId));
    persistToken(result.token);
    return result;
  }
}

export async function getCartAction(): Promise<CartFieldsFragment | null> {
  try {
    const cartToken = await getCartToken();
    if (!cartToken) return null;
    const cart = await createServerHeadkit(cartToken).cart.get();
    return cart as unknown as CartFieldsFragment;
  } catch {
    const { name: cookieName } = cartTokenCookieOptions();
    (await cookies()).delete(cookieName);
    return null;
  }
}

export async function getFullCartAction(): Promise<FullCart | null> {
  try {
    const cartToken = await getCartToken();
    if (!cartToken) return null;
    return await createServerHeadkit(cartToken).cart.get();
  } catch {
    const { name: cookieName } = cartTokenCookieOptions();
    (await cookies()).delete(cookieName);
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
