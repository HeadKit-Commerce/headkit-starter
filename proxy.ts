import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "hk-auth-token";

/** Private account routes that require authentication. */
const PRIVATE_ACCOUNT_PATHS = [
  "/account/profile",
  "/account/orders",
  "/account/wishlist",
];
/** Exact path for login/register - redirect to profile if already authenticated. */
const ACCOUNT_LOGIN_PATH = "/account";

/** IndexNow key files live at the host root (`/{key}.txt`, 8–128 chars). */
const INDEXNOW_KEY_FILE = /^\/([a-zA-Z0-9-]{8,128})\.txt$/;

function isPrivateAccountPath(pathname: string): boolean {
  if (pathname === ACCOUNT_LOGIN_PATH) return false;
  if (pathname.startsWith("/account/orders/")) return true;
  return PRIVATE_ACCOUNT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isAccountLoginPath(pathname: string): boolean {
  return pathname === ACCOUNT_LOGIN_PATH;
}

function isPublicAccountPath(pathname: string): boolean {
  return (
    pathname === "/account/forgot-password" ||
    pathname === "/account/reset-password"
  );
}

/**
 * Rewrite IndexNow ownership proof files to the internal key handler.
 * Must stay at the storefront root — a non-root keyLocation scopes URLs.
 */
function rewriteIndexNowKeyFile(
  request: NextRequest,
  pathname: string,
): NextResponse | null {
  const match = INDEXNOW_KEY_FILE.exec(pathname);
  const key = match?.[1];
  if (!key) return null;

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = "/api/indexnow-key";
  rewriteUrl.searchParams.set("key", key);
  return NextResponse.rewrite(rewriteUrl);
}

export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  const indexNow = rewriteIndexNowKeyFile(request, pathname);
  if (indexNow) return indexNow;

  if (isPublicAccountPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (isPrivateAccountPath(pathname)) {
    if (!token) {
      const url = new URL(ACCOUNT_LOGIN_PATH, request.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isAccountLoginPath(pathname) && token) {
    const url = new URL("/account/profile", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account", "/account/:path*", "/:key.txt"],
};
