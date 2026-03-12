import { cookies } from "next/headers";

const CART_TOKEN_COOKIE = "hk-cart-token";

export async function getCartToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CART_TOKEN_COOKIE)?.value;
}

export function cartTokenCookieOptions() {
  return {
    name: CART_TOKEN_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 48, // 48 hours — matches cart token JWT lifetime
  };
}
