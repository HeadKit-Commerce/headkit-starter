import { connection } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * GET /api/checkout/confirm — MIGRATION SAFETY NET. READ-ONLY BY CONSTRUCTION.
 *
 * THIS ROUTE DELIBERATELY DOES NOT CREATE, FINALISE OR MUTATE AN ORDER, AND
 * ISSUES NO PAYMENT-PROVIDER CALL OF ANY KIND. It redirects and it logs. That
 * is the whole contract.
 *
 * WHY IT EXISTS. The V1 storefront (`headkit-storefront`) creates the
 * WooCommerce order *after* Stripe succeeds, inside this exact browser-return
 * route: it retrieved the PaymentIntent and, on `succeeded`, called the
 * WPGraphQL `checkout()` mutation. Stripe's `return_url` is a per-request
 * parameter built from the store's configured frontend url, so a shopper who
 * was still at their bank for 3D Secure when a store migrated V1 → V2 is
 * returned by that bank — possibly minutes or hours later — to
 * `https://<store>/api/checkout/confirm?payment_intent=pi_…` on the V2 origin.
 * Without this file that request falls through to `app/[...slug]` and 404s:
 * card charged, no order, and no record anywhere that the shopper existed.
 * Draining checkout before a cutover window shrinks that population but cannot
 * empty it, because the operator does not control when the bank returns them.
 *
 * WHY IT MUST NOT DO WHAT V1 DID. Reproducing V1's behaviour here would invert
 * the platform's mandatory ORDER-FIRST checkout model (monorepo CLAUDE.md:
 * create the Order *before* the Stripe object; "Never create a payment session
 * without a prior Order"; "Mark an order paid outside a webhook" is forbidden).
 * V2 finalises orders from the Stripe webhook, which is the authoritative and
 * idempotent path and which already runs for these charges. A second,
 * browser-triggered finalisation would race it and could double-create.
 * Inverting that model in this file is PROHIBITED — do not "improve" this route
 * by having it look the order up, create one, or call Stripe.
 *
 * INERT FOR ANY STORE THAT NEVER RAN V1: nothing links here, it adds no dynamic
 * segment, and it changes no existing route's behaviour. It costs one static
 * path in the route table.
 *
 * OBSERVABILITY CONTRACT. Exactly one structured line per request, event name
 * `checkout.legacy_confirm_return` (see LEGACY_CONFIRM_EVENT). Plan 15.1-05's
 * soak gate asserts by that name that the legacy path returned no not-founds,
 * and it is how a stranded shopper is found afterwards. Do not rename it
 * without updating the soak gate and the runbook. Headers, cookies and the full
 * url are deliberately NOT logged.
 *
 * METHOD SURFACE. Only GET is exported. The App Router answers every
 * unexported verb with 405 Method Not Allowed, which is the desired behaviour
 * *and* the structural guarantee that no mutating verb can ever be added here
 * by accident. Do not export POST/PUT/PATCH/DELETE.
 */

/** Stable event name asserted by the 15.1-05 soak gate and the 15.1-22 runbook. */
const LEGACY_CONFIRM_EVENT = "checkout.legacy_confirm_return";

/**
 * Redirect target. A CONSTANT, never derived from the request — a target built
 * from query input is an open redirect, and this route is reachable by anyone.
 */
const HOLDING_PAGE_PATH = "/checkout/finalising";

/** Logged as-is so the log line records the path without echoing the raw url. */
const LEGACY_CONFIRM_PATH = "/api/checkout/confirm";

/**
 * Stripe PaymentIntent identifier shape. Validated so the operator-facing log
 * carries an id that can actually be looked up, and so an attacker-supplied
 * value is recorded as `invalid` rather than carried through as if it were one.
 */
const paymentIntentId = z
  .string()
  .regex(/^pi_[A-Za-z0-9]{4,64}$/, "not a Stripe PaymentIntent id");

/** Whether the request carried a usable identifier — an explicit marker, never a missing field. */
type IdState = "present" | "absent" | "invalid";

/**
 * The one response this route ever produces. Falls back to a relative Location
 * if the request url cannot be parsed: a shopper holding a charged card must
 * get the holding page even when everything else about the request is broken.
 */
function holdingPageRedirect(request: Request): Response {
  try {
    return Response.redirect(new URL(HOLDING_PAGE_PATH, request.url), 303);
  } catch {
    return new Response(null, {
      status: 303,
      headers: { location: HOLDING_PAGE_PATH },
    });
  }
}

/**
 * Answer a legacy V1 checkout-confirmation return: record it, then send the
 * shopper to the holding page. Never creates an order, never calls Stripe,
 * never throws.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Runtime read — this handler inspects the incoming request, so it must not
    // be prerendered. `connection()` is how the codebase marks a route handler
    // request-time (see app/api/revalidate/route.ts); Cache Components bans the
    // route-segment dynamic export, and no caching directive belongs here.
    await connection();

    const raw = new URL(request.url).searchParams.get("payment_intent");

    let paymentIntent: string | null = null;
    let idState: IdState;
    if (raw === null || raw === "") {
      idState = "absent";
    } else {
      const parsed = paymentIntentId.safeParse(raw);
      if (parsed.success) {
        paymentIntent = parsed.data;
        idState = "present";
      } else {
        // The raw value is NOT logged: it is attacker-controllable and would
        // put unvalidated content into an operator-facing record.
        idState = "invalid";
      }
    }

    logger.info(LEGACY_CONFIRM_EVENT, {
      paymentIntent,
      idState,
      path: LEGACY_CONFIRM_PATH,
    });

    return holdingPageRedirect(request);
  } catch (error) {
    // The safety net itself failed. Record the failure by name only — never the
    // message, which can carry request content — and still redirect.
    logger.error(`${LEGACY_CONFIRM_EVENT}.error`, {
      path: LEGACY_CONFIRM_PATH,
      name: error instanceof Error ? error.name : "unknown",
    });
    return holdingPageRedirect(request);
  }
}
