/**
 * The controls that make placing an order structurally impossible.
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
 *  2. PAYMENT HOSTS ARE UNREACHABLE. No payment provider script is ever loaded
 *     on any page this harness opens (see `DEFAULT_BLOCKED_HOSTS`), so there is
 *     no payment element to confirm even if something else went wrong.
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
