import { describe, expect, it } from "vitest";
import {
  hostRobotsTag,
  ROBOTS_TAG_HEADER,
  ROBOTS_TAG_NOINDEX,
} from "./host-robots";
import { resolveRobots } from "./make-metadata";

const LIVE = "https://www.customer.com.au";

/**
 * The host arm of the indexing decision, after it moved out of
 * `generateMetadata` and into an `X-Robots-Tag` response header
 * (`lib/host-robots.ts` carries the measurement that forced the move).
 *
 * SCOPE, stated because a guard that claims more than it checks is worse than
 * none. This file exercises the PURE DECISION — given an origin and a host,
 * what directive does the page carry — and the composition of that decision
 * with the store switch that stayed in the meta. It does NOT exercise:
 *
 *  - `proxy.ts` actually calling it, or the header surviving onto a rewritten /
 *    redirected / cached response. Only a deployment shows that;
 *    `e2e/store-parity.spec.ts` is the layer that reads it over HTTP.
 *  - `app/robots.ts`, which keeps its own in-process host read
 *    (`lib/indexing-decision.ts`) — `app/seo-robots-sitemap.test.ts` pins the
 *    agreement between robots.txt and the page's effective directive.
 *  - the label-wise host comparison itself, which is `lib/host-indexing.test.ts`
 *    (lookalikes, subdomains, ports, trailing dots, case).
 */
describe("hostRobotsTag", () => {
  it("emits nothing on the store's own declared host", () => {
    expect(hostRobotsTag(LIVE, "www.customer.com.au")).toBeNull();
    // apex and www of the configured domain compare equal
    expect(hostRobotsTag(LIVE, "customer.com.au")).toBeNull();
  });

  it("emits noindex on a rehearsal host serving the same catalogue", () => {
    expect(hostRobotsTag(LIVE, "customer-rehearsal.headkit.app")).toBe(
      ROBOTS_TAG_NOINDEX,
    );
    expect(hostRobotsTag(LIVE, "acme-git-branch-headkit.vercel.app")).toBe(
      ROBOTS_TAG_NOINDEX,
    );
  });

  it("fails CLOSED when either side is unknown", () => {
    // An unreadable store origin (`""` is what proxy.ts degrades to) and a
    // missing Host both mean "this could be anywhere" — and the expensive
    // mistake is leaving a rehearsal host open, not noindexing one request.
    expect(hostRobotsTag("", "www.customer.com.au")).toBe(ROBOTS_TAG_NOINDEX);
    expect(hostRobotsTag(null, "www.customer.com.au")).toBe(ROBOTS_TAG_NOINDEX);
    expect(hostRobotsTag(LIVE, "")).toBe(ROBOTS_TAG_NOINDEX);
    expect(hostRobotsTag(LIVE, null)).toBe(ROBOTS_TAG_NOINDEX);
  });

  it("emits the same directive the maintenance 503 does", () => {
    // Two places in this app tell a crawler to go away. They must say it the
    // same way, or one of them is a second spelling nobody maintains.
    expect(ROBOTS_TAG_HEADER).toBe("X-Robots-Tag");
    expect(ROBOTS_TAG_NOINDEX).toBe("noindex, nofollow");
  });
});

/**
 * The two arms together — the assertion that actually protects the estate.
 *
 * Before this change ONE function (`resolveRobots`) answered both, so a single
 * expectation covered the whole property. It is now split across a response
 * header and a meta tag, and a test of either half alone passes while the other
 * half is broken. So the effective directive is composed here, the way a
 * crawler composes it: robots rules combine to the MOST RESTRICTIVE, and since
 * neither arm can ever emit `index` as an override, `noindex` from either arm
 * wins.
 */
describe("the page's effective indexing directive", () => {
  function pageIndexes(allowIndexing: boolean, host: string): boolean {
    const meta = resolveRobots(allowIndexing);
    const metaIndexes =
      typeof meta === "object" &&
      meta !== null &&
      meta.index === true &&
      meta.follow === true;
    return metaIndexes && hostRobotsTag(LIVE, host) === null;
  }

  it("opens ONLY on the store's own host with the switch on", () => {
    expect(pageIndexes(true, "www.customer.com.au")).toBe(true);
  });

  it("closes on a rehearsal host even with the switch on", () => {
    // The case the whole host gate exists for: a rehearsal serves the REAL
    // catalogue, so an open rehearsal host competes with the customer in
    // search and the damage outlives the rehearsal.
    expect(pageIndexes(true, "customer-rehearsal.headkit.app")).toBe(false);
  });

  it("closes on the store's own host when the switch is off", () => {
    expect(pageIndexes(false, "www.customer.com.au")).toBe(false);
  });

  it("closes when both are shut", () => {
    expect(pageIndexes(false, "customer-rehearsal.headkit.app")).toBe(false);
  });
});
