/**
 * The controls against placing an order, and the two declared gaps in them.
 *
 * The Dishee rehearsal storefront is armed with LIVE Stripe against a real
 * merchant account. A completed order there is a real charge on real money. So
 * "the fixture list does not contain a checkout submit" is not the control —
 * the fixture list is data, and data changes. These are the controls:
 *
 *  1. NON-GET IS REFUSED AT THE BROWSER. Every request the page issues passes
 *     through {@link installGetOnlyGuard}; anything that is not a GET is
 *     aborted before it leaves the process and recorded on the capture record.
 *     A form submit, an `action`, a `fetch('POST')` — none of them reach the
 *     network. The recording matters as much as the abort: a page that TRIED is
 *     something the operator should see.
 *
 *  2. PAYMENT HOSTS ARE REFUSED AT THE ROUTE HANDLER. No payment provider script
 *     is loaded on any page this harness opens by a request the PAGE issues (see
 *     `DEFAULT_BLOCKED_HOSTS`), so there is no payment element to confirm even if
 *     something else went wrong — subject to the two declared gaps below.
 *
 * CONTROLS 1 AND 2 ARE BLIND TO A SERVICE WORKER. Both are enforced by ONE
 * `context.route()` handler, and Playwright's `context.route()` does not
 * intercept requests issued by a service worker. `capture.ts` does not pass
 * `serviceWorkers: "block"` to `newContext()`, so that option holds its default
 * of `'allow'`. For a target that registers a service worker, therefore: a
 * non-GET the worker issues is neither aborted nor recorded on `blocked`, and a
 * host in `DEFAULT_BLOCKED_HOSTS` is reachable through it. AN EMPTY
 * `blockedRequests` LIST IS NOT PROOF THAT NOTHING MUTATING WAS ATTEMPTED — it
 * proves only that nothing mutating reached the route handler. GATE 0 does not
 * cover this: `testserver/server.ts` registers no service worker, so the
 * behavioural proof below passes with the hole standing. THIS GAP IS ACCEPTED,
 * NOT PENDING: `260825-port-verify-service-worker-blind-guard` proposed
 * `serviceWorkers: "block"` plus a GATE 0 service-worker fixture and was CLOSED
 * AS DECLINED — service workers stay enabled, because blocking them changes what
 * a worker-backed page renders into a capture, on an instrument whose whole job
 * is fidelity comparison. No code fix is coming, so the protection is a
 * PER-TARGET MEASUREMENT and the acceptance is conditional on it: REOPEN THIS
 * BEFORE POINTING THE HARNESS AT ANY STORE WHOSE SERVICE-WORKER STATUS HAS NOT
 * BEEN MEASURED. Measured read-only 2026-08-25: none of the
 * three hosts this harness is pointed at (`dishee-rehearsal.headkit.app`,
 * `www.dishee.com.au`, `pebblrbooth.com.au`) registers a service worker in its
 * served homepage HTML. That check greps the homepage for `serviceWorker` /
 * `sw.js` / `workbox`, so a registration inside a bundled JS chunk or on a
 * non-homepage route would not have shown up — it is evidence the hole does not
 * bite on today's targets, not proof that it cannot.
 *
 * A BLOCKED-HOST GET IS ABORTED WITHOUT BEING RECORDED. {@link installGetOnlyGuard}
 * records a non-GET and THEN aborts it, but a `GET` to a host in
 * `DEFAULT_BLOCKED_HOSTS` is aborted and pushed onto nothing. So the capture
 * record and the report cannot show whether a payment provider was contacted at
 * all — and because this harness exists to diff a V1 capture against a V2 one, a
 * V1-versus-V2 difference in payment-script loading does NOT appear as a
 * difference: both runs abort identically, both record nothing, and a real port
 * defect of that shape renders as a MATCH. Tracked as
 * `260825-port-verify-blocked-get-not-recorded`, which is STILL OPEN AND
 * UNDECIDED — unlike the service-worker gap above, which is closed as accepted.
 * Do not read the two as one status. They are also different defects: that one
 * is about requests ESCAPING the guard, this one is about requests the guard
 * CAUGHT and DISCARDED.
 *
 *  3. THE HARNESS HAS NO INTERACTION SURFACE. It navigates, reads and
 *     screenshots. It never clicks, types, presses, submits, drags or uploads.
 *
 * Item 3 is held by two different things, and they are not interchangeable:
 *
 *  - GATE 0 in `gate.ts` is the EVIDENCE. `/order-attempt` on the synthetic
 *    storefront carries a POST form and fires a POST from script the moment it
 *    loads; the capture must record the attempt and the server must log zero
 *    non-GET requests. That is behaviour, executed end to end, and it is what
 *    actually proves the property holds today. It has already earned its place
 *    by catching a real hole in the route-handler registration order.
 *  - The unit test over {@link FORBIDDEN_INTERACTION_APIS} in `safety.test.ts`
 *    is a SOURCE-TEXT TRIPWIRE, not the proof. It substring-matches this
 *    directory's source and executes nothing, so it cannot see indirection and
 *    it fires on a dead or commented-out occurrence. It exists as defence in
 *    depth for the case GATE 0 cannot cover: someone extending this harness
 *    later adding `page.fill()` to a capture pass, which GATE 0 would not
 *    notice because that page never POSTs.
 */

import type { BrowserContext } from "@playwright/test";
import type { BlockedRequest } from "./types";

/**
 * Playwright APIs that mutate page state. None may appear in this directory.
 *
 * Written as fragments matched against source text, and consumed only by the
 * source-text tripwire in `safety.test.ts` — see the module docblock above for
 * what that guard does and does not prove. `page.goto`, `screenshot` and
 * `evaluate` are deliberately absent from the list: navigating, reading and
 * photographing are the harness's whole job.
 */
export const FORBIDDEN_INTERACTION_APIS: readonly string[] = [
  ".click(",
  ".dblclick(",
  ".fill(",
  ".type(",
  ".press(",
  ".pressSequentially(",
  ".check(",
  ".uncheck(",
  ".selectOption(",
  ".setInputFiles(",
  ".dragTo(",
  ".tap(",
  ".hover(",
  "keyboard.",
  "mouse.",
  "touchscreen.",
  ".setChecked(",
  ".dispatchEvent(",
  "request.post(",
  "request.put(",
  "request.patch(",
  "request.delete(",
  "request.fetch(",
];

/** Whether a hostname is inside the blocked set (exact or a subdomain). */
export function isBlockedHost(
  hostname: string,
  blocked: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return blocked.some((b) => host === b || host.endsWith(`.${b}`));
}

/**
 * Install the GET-only, no-payment-hosts guard on a browser context.
 *
 * REGISTER THIS LAST. Playwright runs route handlers in REVERSE registration
 * order, so the last one installed is the first one consulted. The guard has to
 * be first, and it hands allowed requests on with `fallback()` rather than
 * `continue()` so any handler registered before it still runs. Installing it
 * before another handler would let that handler serve a request the guard never
 * saw — and the request it would miss is a document-level POST, which is
 * exactly what a form submit on a checkout page is.
 *
 * Returns the list the guard writes into, so the capture record can carry what
 * the page attempted.
 */
export async function installGetOnlyGuard(
  context: BrowserContext,
  blockedHosts: readonly string[],
): Promise<BlockedRequest[]> {
  const blocked: BlockedRequest[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();
    if (method !== "GET") {
      blocked.push({ method, url });
      await route.abort("blockedbyclient");
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = "";
    }
    if (hostname !== "" && isBlockedHost(hostname, blockedHosts)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
  return blocked;
}
