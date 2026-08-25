import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCKED_HOSTS,
  DEFAULT_MASKS,
  loadPlan,
  masksForPath,
} from "./plan";
import { isBlockedHost } from "./safety";

const here = dirname(fileURLToPath(import.meta.url));
const plans = join(here, "..", "plans");
const inventories = join(here, "..", "..", "fixtures");

function tempPlan(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "port-verify-plan-"));
  const file = join(dir, "plan.json");
  writeFileSync(file, JSON.stringify(body));
  return file;
}

describe("reading a store's url inventory", () => {
  it("reads the same fixture contract store-parity.spec.ts reads", () => {
    // Not a copy of the list: the SAME file. The two tools cannot drift onto
    // two different ideas of what a store's URLs are.
    const plan = loadPlan(join(inventories, "pebblr-url-inventory.json"));
    expect(plan.targets.length).toBeGreaterThan(40);
    expect(plan.targets.every((t) => t.path.startsWith("/"))).toBe(true);
  });

  it("honours the inventory's own `excluded` flag and records why", () => {
    const plan = loadPlan(join(inventories, "pebblr-url-inventory.json"));
    expect(plan.skipped.map((s) => s.path)).toContain("/account/orders");
    expect(plan.targets.map((t) => t.path)).not.toContain("/account/orders");
    expect(plan.skipped.every((s) => s.reason !== "")).toBe(true);
  });
});

describe("store overlays", () => {
  it("adds the URLs whose STATUS is the thing under test, signals-only", () => {
    const plan = loadPlan(join(plans, "pebblr-rehearsal.json"));
    const flat = plan.targets.find((t) => t.path === "/products/gold-package");
    // The flat product URL's "after" is a 308: no page, so no pixel pair.
    expect(flat?.mode).toBe("signals");
    const nested = plan.targets.find(
      (t) => t.path === "/shop/booths/photo/gold-package",
    );
    expect(nested?.mode).toBe("full");
  });

  it("carries a reason on every mask", () => {
    for (const name of ["pebblr-rehearsal.json", "dishee-rehearsal.json"]) {
      const plan = loadPlan(join(plans, name));
      expect(plan.masks.length).toBeGreaterThan(0);
      expect(plan.masks.every((m) => m.why.trim() !== "")).toBe(true);
    }
  });

  it("blocks payment hosts by default so no payment script can load", () => {
    const plan = loadPlan(join(plans, "dishee-rehearsal.json"));
    expect(plan.blockedHosts).toEqual(DEFAULT_BLOCKED_HOSTS);
    expect(plan.blockedHosts).toContain("js.stripe.com");
  });

  it("lets a plan EXTEND the blocked hosts but never shrink them", () => {
    // Fixture data must not be able to defeat a payment-safety control. A plan
    // adding one unrelated host used to REPLACE the list, which silently
    // un-blocked Stripe, PayPal and Google/Apple Pay for that store — including
    // the dishee plan, whose Stripe is live against a real merchant account.
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        blocked_hosts: ["cdn.tracking.example"],
      }),
    );
    expect(plan.blockedHosts).toContain("cdn.tracking.example");
    for (const host of DEFAULT_BLOCKED_HOSTS) {
      expect(plan.blockedHosts).toContain(host);
    }
    expect(isBlockedHost("js.stripe.com", plan.blockedHosts)).toBe(true);
    expect(isBlockedHost("checkout.stripe.com", plan.blockedHosts)).toBe(true);
    expect(isBlockedHost("pay.google.com", plan.blockedHosts)).toBe(true);
  });

  it("does not duplicate a host a plan re-declares", () => {
    const plan = loadPlan(
      tempPlan({ entries: [{ path: "/a" }], blocked_hosts: ["js.stripe.com"] }),
    );
    expect(plan.blockedHosts.filter((h) => h === "js.stripe.com")).toHaveLength(
      1,
    );
  });
});

describe("failing loudly rather than reporting a green zero-case", () => {
  it("refuses an inventory with no entries", () => {
    expect(() => loadPlan(tempPlan({ entries: [] }))).toThrow(/zero entries/);
  });

  it("refuses an inventory where everything is excluded", () => {
    expect(() =>
      loadPlan(tempPlan({ entries: [{ path: "/a", excluded: true }] })),
    ).toThrow(/nothing would be captured/);
  });

  it("refuses a file that is not there", () => {
    expect(() => loadPlan(join(here, "no-such-plan.json"))).toThrow(
      /cannot read plan file/,
    );
  });

  it("refuses a mask with no stated reason", () => {
    expect(() =>
      loadPlan(
        tempPlan({ entries: [{ path: "/a" }], masks: [{ selector: ".x" }] }),
      ),
    ).toThrow(/why is required/);
  });

  it("refuses a normalisation rule with no stated reason", () => {
    expect(() =>
      loadPlan(
        tempPlan({
          entries: [{ path: "/a" }],
          normalize: [{ field: "links", pattern: "x", replace: "y" }],
        }),
      ),
    ).toThrow(/why is required/);
  });

  it("refuses an entry whose path is not site-relative", () => {
    expect(() =>
      loadPlan(tempPlan({ entries: [{ path: "https://x.invalid/a" }] })),
    ).toThrow(/site-relative/);
  });
});

describe("mask scoping", () => {
  it("applies an unscoped mask everywhere and a scoped one only where named", () => {
    const scoped = [
      { selector: ".a", why: "everywhere", paths: [] },
      {
        selector: ".b",
        why: "checkout only",
        paths: ["/checkout/**", "/checkout"],
      },
    ];
    expect(masksForPath("/", scoped).map((m) => m.selector)).toEqual([".a"]);
    expect(masksForPath("/checkout", scoped).map((m) => m.selector)).toEqual([
      ".a",
      ".b",
    ]);
  });

  it("defaults to the built-in masks when a plan declares none", () => {
    const plan = loadPlan(tempPlan({ entries: [{ path: "/a" }] }));
    expect(plan.masks).toEqual(DEFAULT_MASKS);
  });

  it("keeps every default when a plan adds one of its own", () => {
    // Replacing rather than extending meant a store that masked one volatile
    // element silently lost `iframe`, so every page carrying an embedded frame
    // reported pixel rows on an untouched target — noisy red nobody would
    // connect to a mask declared weeks earlier.
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        masks: [{ selector: ".stock-count", why: "counts down live" }],
      }),
    );
    const selectors = plan.masks.map((m) => m.selector);
    for (const d of DEFAULT_MASKS) expect(selectors).toContain(d.selector);
    expect(selectors).toContain(".stock-count");
  });

  it("lets a plan restate a default's reason but never narrow its coverage", () => {
    // Path-scoping a default would have reached the same coverage loss the
    // union closed — iframe masked on /book and nowhere else — by narrowing
    // instead of by omission, which is harder to spot rather than easier.
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        masks: [
          {
            selector: "iframe",
            why: "this store embeds a booking widget",
            paths: ["/book"],
          },
        ],
      }),
    );
    const iframe = plan.masks.filter((m) => m.selector === "iframe");
    expect(iframe).toHaveLength(1);
    expect(iframe[0]!.why).toBe("this store embeds a booking widget");
    expect(iframe[0]!.paths).toEqual([]);
    expect(masksForPath("/", plan.masks).map((m) => m.selector)).toContain(
      "iframe",
    );
    expect(
      masksForPath("/anything/else", plan.masks).map((m) => m.selector),
    ).toContain("iframe");
    // Restating one default must not drop the others.
    expect(plan.masks.map((m) => m.selector)).toContain("video");
  });

  it("lets a plan path-scope a NEW selector it introduces", () => {
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        masks: [
          {
            selector: ".stock-count",
            why: "counts down live",
            paths: ["/p/**"],
          },
        ],
      }),
    );
    expect(
      masksForPath("/p/thing", plan.masks).map((m) => m.selector),
    ).toContain(".stock-count");
    expect(
      masksForPath("/other", plan.masks).map((m) => m.selector),
    ).not.toContain(".stock-count");
  });

  it("carries every default mask into the shipped store plans", () => {
    // The plans no longer re-declare the defaults; they inherit them, and the
    // report's blind-spot table is rendered from this list.
    for (const name of ["pebblr-rehearsal.json", "dishee-rehearsal.json"]) {
      const plan = loadPlan(join(plans, name));
      const selectors = plan.masks.map((m) => m.selector);
      for (const d of DEFAULT_MASKS) expect(selectors).toContain(d.selector);
      expect(plan.masks.every((m) => m.why.trim() !== "")).toBe(true);
    }
  });
});
