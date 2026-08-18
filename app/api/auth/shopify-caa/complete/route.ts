/**
 * Completes Customer Account login after the platform OAuth callback.
 * Redeems a short-lived handoff from dashboard-api and sets hk-auth-token.
 */

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

const AUTH_COOKIE = "hk-auth-token";
const CAA_PREFIX = "shcaa:";

function frontendOrigin(request: NextRequest): string {
  return (
    env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin
  );
}

function platformAPIBase(): string {
  const explicit =
    process.env.HEADKIT_PLATFORM_URL?.trim() ||
    process.env.NEXT_PUBLIC_HEADKIT_PLATFORM_URL?.trim() ||
    "";
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const dash =
    env.DASHBOARD_API_URL?.replace(/\/$/, "") ||
    process.env.DASHBOARD_API_URL?.replace(/\/$/, "") ||
    "";
  const suffix = "/graphql/subgraph/headkit";
  if (dash.endsWith(suffix)) {
    return dash.slice(0, -suffix.length);
  }
  return "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = frontendOrigin(request);
  const errRedirect = (msg: string): NextResponse => {
    const u = new URL("/account", origin);
    u.searchParams.set("caa_error", msg);
    return NextResponse.redirect(u, 302);
  };

  const handoff = request.nextUrl.searchParams.get("handoff");
  if (!handoff) {
    return errRedirect("missing_handoff");
  }
  const platform = platformAPIBase();
  if (!platform) {
    return errRedirect("missing_platform_url");
  }

  const redeem = new URL(`${platform}/api/v1/public/shopify/caa/redeem`);
  redeem.searchParams.set("handoff", handoff);

  let accessToken = "";
  try {
    const res = await fetch(redeem.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = (await res.json()) as {
      data?: { accessToken?: string };
      accessToken?: string;
      message?: string;
    };
    // utils.Respond wraps as { message, data, error }
    accessToken = payload.data?.accessToken || payload.accessToken || "";
    if (!res.ok || !accessToken) {
      return errRedirect("handoff_redeem_failed");
    }
  } catch {
    return errRedirect("handoff_redeem_failed");
  }

  const res = NextResponse.redirect(new URL("/account/profile", origin), 302);
  res.cookies.set(AUTH_COOKIE, CAA_PREFIX + accessToken, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
