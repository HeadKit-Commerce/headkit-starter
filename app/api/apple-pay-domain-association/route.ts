import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Apple Pay domain-association file.
 *
 * Stripe requires the serving domain to expose
 * `/.well-known/apple-developer-merchantid-domain-association` returning the
 * Stripe-issued association token, otherwise Apple Pay / the
 * ExpressCheckoutElement renders empty (PAY-06 / INFRA-06). A `next.config`
 * rewrite maps that `.well-known` path to this handler so it bypasses the
 * `/[...slug]` catch-all (which otherwise returns the HTML app shell and fails
 * Stripe's verification).
 *
 * The token is served from `APPLE_PAY_DOMAIN_ASSOCIATION` (set per-environment
 * in Vercel) rather than committed — it is environment-specific and downloaded
 * from the Stripe Dashboard when the domain is registered. Returns 404 until
 * the env var is set, so an unconfigured deploy fails verification loudly
 * rather than serving a wrong file.
 */
export function GET(): Response {
  const token = env.APPLE_PAY_DOMAIN_ASSOCIATION;
  if (!token) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(token, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
