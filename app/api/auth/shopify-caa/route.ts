/**
 * Shopify Customer Account API — start OAuth via HeadKit platform.
 *
 * Storefront never registers as OAuth redirect_uri. The Partner-allowlisted
 * callback is fixed on dashboard-api; this route only hands off shop + return
 * origin so PKCE stays server-side on the platform.
 */

import { NextResponse } from "next/server";

import { env } from "@/lib/env";

function caaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOPIFY_CAA_ENABLED === "true";
}

function shopDomain(): string {
  return (
    process.env.SHOPIFY_STORE_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN?.trim() ||
    ""
  );
}

function shopID(): string {
  const raw =
    process.env.SHOPIFY_SHOP_ID?.trim() ||
    process.env.NEXT_PUBLIC_SHOPIFY_SHOP_ID?.trim() ||
    "";
  const slash = raw.lastIndexOf("/");
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

function frontendOrigin(): string {
  return (
    env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_FRONTEND_URL?.replace(/\/$/, "") ||
    ""
  );
}

/** Platform API origin (not the branding GraphQL path). */
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

export async function GET(): Promise<NextResponse> {
  if (!caaEnabled()) {
    return NextResponse.json(
      { error: "Customer Account API is not enabled" },
      { status: 404 },
    );
  }
  const domain = shopDomain();
  const sid = shopID();
  const origin = frontendOrigin();
  const platform = platformAPIBase();
  if (!domain || !sid || !origin || !platform) {
    return NextResponse.json(
      {
        error:
          "Missing SHOPIFY_STORE_DOMAIN, SHOPIFY_SHOP_ID, NEXT_PUBLIC_FRONTEND_URL, or HEADKIT_PLATFORM_URL / DASHBOARD_API_URL",
      },
      { status: 500 },
    );
  }

  const start = new URL(`${platform}/api/v1/public/shopify/caa/start`);
  start.searchParams.set("shop", domain);
  start.searchParams.set("shop_id", sid);
  start.searchParams.set("return_origin", origin);
  return NextResponse.redirect(start.toString(), 302);
}
