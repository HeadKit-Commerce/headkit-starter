import { NextRequest, NextResponse } from "next/server";

/** Must match `DEFAULT_POSTS_BASE_PATH` in lib/posts-base-path.ts (internal route). */
const DEFAULT_POSTS_BASE_PATH = "news";

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

/**
 * Resolve the public blog base path (WordPress Posts page slug).
 * Defaults to `news` when the API is unreachable or returns the default.
 */
async function resolvePostsBasePath(request: NextRequest): Promise<string> {
  try {
    const url = new URL("/api/posts-base-path", request.url);
    const res = await fetch(url, {
      // Edge-friendly: honour Cache-Control from the route handler.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return DEFAULT_POSTS_BASE_PATH;
    const data = (await res.json()) as { base?: unknown };
    return typeof data.base === "string" && data.base.length > 0
      ? data.base
      : DEFAULT_POSTS_BASE_PATH;
  } catch {
    return DEFAULT_POSTS_BASE_PATH;
  }
}

/**
 * Map the store's Posts-page slug onto the internal `/news` App Router tree.
 *
 * Example (Paralel): public `/insights` and `/insights/<slug>` rewrite to
 * `/news` and `/news/<slug>` so the URL matches Settings → Reading. Legacy
 * `/news` URLs 308 to the canonical base when it differs.
 */
async function rewritePostsBasePath(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  // Skip the JSON endpoint itself and obvious non-page assets.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return null;
  }

  const base = await resolvePostsBasePath(request);
  if (base === DEFAULT_POSTS_BASE_PATH) {
    return null;
  }

  const basePrefix = `/${base}`;
  if (pathname === basePrefix || pathname.startsWith(`${basePrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname =
      pathname === basePrefix
        ? `/${DEFAULT_POSTS_BASE_PATH}`
        : pathname.replace(basePrefix, `/${DEFAULT_POSTS_BASE_PATH}`);
    return NextResponse.rewrite(url);
  }

  const newsPrefix = `/${DEFAULT_POSTS_BASE_PATH}`;
  if (pathname === newsPrefix || pathname.startsWith(`${newsPrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname =
      pathname === newsPrefix
        ? basePrefix
        : pathname.replace(newsPrefix, basePrefix);
    return NextResponse.redirect(url, 308);
  }

  return null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  const indexNow = rewriteIndexNowKeyFile(request, pathname);
  if (indexNow) return indexNow;

  const postsRewrite = await rewritePostsBasePath(request, pathname);
  if (postsRewrite) return postsRewrite;

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
  matcher: [
    "/account",
    "/account/:path*",
    "/:key.txt",
    // Blog base-path rewrite + legacy /news → canonical Posts-page slug.
    // Exclude Next internals and common static file extensions.
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
