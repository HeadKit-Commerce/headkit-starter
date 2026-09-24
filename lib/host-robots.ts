import { isIndexableHost } from "@/lib/host-indexing";

/** Response header name. Case-insensitive on the wire; this spelling is Google's. */
export const ROBOTS_TAG_HEADER = "X-Robots-Tag";

/** The one value this gate ever emits. Matches the maintenance 503's header. */
export const ROBOTS_TAG_NOINDEX = "noindex, nofollow";

/**
 * The host-based indexing signal, as a RESPONSE HEADER rather than a meta tag.
 *
 * ---------------------------------------------------------------------------
 * WHY IT MOVED OUT OF `generateMetadata`
 * ---------------------------------------------------------------------------
 * The `robots` meta used to be decided per request from the Host, which meant
 * `generateMetadata` read runtime data on every route. Under Cache Components
 * that is only legal when the route has a dynamic hole, so the root layout
 * rendered `DynamicMetadataMarker` (`await connection()`) inside `<Suspense>`
 * to give EVERY route one. A request-time read in the ROOT layout postpones a
 * hole in every route in the application, so no response can be served as a
 * finished file — each one is produced by a runtime React resume.
 *
 * Measured cost of that one line, isolated by a three-way one-variable A/B on
 * a deployed probe (Bike Society, report `260915-bs-click-latency-scout` §4.2,
 * same region and hour): a root layout with NO boundary answered 6 ms on a
 * 27 KB page and 70 ms on a 236 KB one; `<Suspense>` around a CACHED child
 * answered 6 ms / 79 ms; `<Suspense>` + `await connection()` answered
 * **1,419 ms / 2,378 ms, with 44–68 % more bytes**. The middle row is the
 * control that pins the cost on the request-time read rather than on the
 * boundary — a root-layout boundary is free, the read inside one is not.
 *
 * A response header carries the same directive to every crawler that honours
 * `noindex`, costs no render-time anything, and is set in `proxy.ts`, which was
 * already reading the request host for the maintenance gate.
 *
 * ---------------------------------------------------------------------------
 * THE PROPERTY THIS PRESERVES
 * ---------------------------------------------------------------------------
 * A migration rehearsal serves the store's REAL catalogue from a temporary
 * host. If that host is crawlable it competes with the customer's live site in
 * search and the damage outlives the rehearsal. So: a host that is NOT the
 * store's declared production host answers `noindex, nofollow`; the store's own
 * live host answers no header at all.
 *
 * `isIndexableHost` fails CLOSED for every uncertainty (no configured origin,
 * an unparseable one, a missing host, a subdomain, a lookalike), so an unknown
 * host is treated as a temporary host — the same verdict the metadata gate made.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS STILL IN THE META, AND WHY THE TWO CANNOT CONTRADICT
 * ---------------------------------------------------------------------------
 * The STORE switch (`allowIndexing`) stays in `generateMetadata`
 * (`resolveRobots`): it is a cached, per-store value, not a per-request one, so
 * it costs no dynamic hole. Only the HOST arm moved here.
 *
 * Both signals can only CLOSE indexing — no route emits `index` as an override
 * and no path here emits anything but `noindex, nofollow` — so the header and
 * the meta can never pull in opposite directions. Where they do both speak,
 * Google resolves conflicting robots rules by applying the MORE RESTRICTIVE
 * one, which is the direction this gate always argues in.
 *
 * `robots.txt` keeps its own in-process host read (`app/robots.ts`): it is a
 * tiny uncached route with no static shell to lose, and it must stay able to
 * fail closed on its own.
 *
 * ---------------------------------------------------------------------------
 * THE ONE CLASS THIS HEADER DOES NOT REACH
 * ---------------------------------------------------------------------------
 * `proxy.ts`'s matcher excludes any path containing a dot, so a path-encoded
 * facet URL (`/collections/locks/f/colour.black`) never reaches the proxy and
 * carries no header. It is not an exposure the meta covered either: on a
 * non-indexable host `app/robots.ts` answers `Disallow: /`, so a compliant
 * crawler fetches neither the page nor its head, and the meta the old shape
 * emitted was equally unreadable. Widening the matcher would newly subject
 * those URLs to the maintenance gate too, which is a separate decision.
 */
export function hostRobotsTag(
  configuredUrl: string | null | undefined,
  currentHost: string | null | undefined,
): string | null {
  return isIndexableHost(configuredUrl, currentHost)
    ? null
    : ROBOTS_TAG_NOINDEX;
}
