/**
 * Legacy storefront CAA callback — no longer the OAuth redirect_uri.
 * Redirects to account so old Partner allowlist entries fail closed cleanly.
 */

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

function frontendOrigin(request: NextRequest): string {
  return (
    env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = frontendOrigin(request);
  const u = new URL("/account", origin);
  u.searchParams.set(
    "caa_error",
    "legacy_callback_retired_use_platform_redirect",
  );
  return NextResponse.redirect(u, 302);
}
