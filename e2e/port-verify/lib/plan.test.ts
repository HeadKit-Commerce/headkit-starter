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
  normalizeForPath,
} from "./plan";
import { isBlockedHost } from "./safety";
import { applyRules } from "./normalize";
import { extractAnchorHrefs, htmlToText } from "./html";

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

  it("keeps a store's own mask ON TOP of the defaults, never instead of them", () => {
    // The declaration that made this non-vacuous: both shipped plans now carry
    // a mask of their own for the related-products carousel. A plan whose
    // `masks` REPLACED the defaults would still pass a "the carousel is
    // masked" check while having silently un-masked every iframe on the store,
    // which is the shape of a real finding on this harness's `blocked_hosts`.
    for (const name of ["pebblr-rehearsal.json", "dishee-rehearsal.json"]) {
      const plan = loadPlan(join(plans, name));
      const selectors = plan.masks.map((m) => m.selector);
      expect(selectors).toContain('[id^="related-products-item-"]');
      for (const d of DEFAULT_MASKS) expect(selectors).toContain(d.selector);
      // ... and the payment list is still whole beside it.
      for (const host of DEFAULT_BLOCKED_HOSTS) {
        expect(plan.blockedHosts).toContain(host);
      }
    }
  });

  it("applies an unscoped normalisation rule everywhere", () => {
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        normalize: [
          {
            field: "links",
            pattern: "x",
            replace: "y",
            why: "volatile",
          },
        ],
      }),
    );
    expect(plan.normalize[0]!.paths).toEqual([]);
    expect(normalizeForPath("/a", plan.normalize)).toHaveLength(1);
    expect(normalizeForPath("/anything/else", plan.normalize)).toHaveLength(1);
  });

  it("confines a path-scoped normalisation rule to the paths it names", () => {
    const plan = loadPlan(
      tempPlan({
        entries: [{ path: "/a" }],
        normalize: [
          {
            field: "links",
            pattern: "/products/[a-z-]+",
            replace: "/products/{related}",
            paths: ["/shop/**"],
            why: "the related-products carousel picks per render",
          },
        ],
      }),
    );
    expect(normalizeForPath("/shop/cat/thing", plan.normalize)).toHaveLength(1);
    // The grid pages, whose product links are the catalogue itself.
    expect(normalizeForPath("/shop", plan.normalize)).toHaveLength(0);
    expect(normalizeForPath("/search", plan.normalize)).toHaveLength(0);
    expect(normalizeForPath("/collections/x", plan.normalize)).toHaveLength(0);
  });

  it("scopes dishee's carousel rules to product pages and nowhere else", () => {
    // The whole reason `paths` exists on a normalisation rule: run store-wide,
    // this rule would collapse every product grid on the store to one token.
    const plan = loadPlan(join(plans, "dishee-rehearsal.json"));
    expect(plan.normalize.length).toBeGreaterThan(0);
    expect(plan.normalize.every((r) => r.paths.length > 0)).toBe(true);
    expect(
      normalizeForPath(
        "/shop/dish-brushes/dishee-dish-brush-black",
        plan.normalize,
      ).length,
    ).toBe(plan.normalize.length);
    for (const grid of [
      "/shop",
      "/search",
      "/featured",
      "/",
      "/collections/flora",
    ]) {
      expect(normalizeForPath(grid, plan.normalize)).toHaveLength(0);
    }
  });

  it("collapses a dishee carousel's four picks to one token and nothing else", () => {
    const plan = loadPlan(join(plans, "dishee-rehearsal.json"));
    const rules = normalizeForPath(
      "/shop/dish-brushes/dishee-dish-brush-black",
      plan.normalize,
    );
    const picked = [
      "/products/dishee-dish-brush-coral",
      "/products/dishee-dish-brush-ocean",
      "/products/dishee-dish-brush-sky",
      "/products/dishee-dish-brush-white",
    ].map((h) => applyRules("links", h, rules));
    expect(new Set(picked).size).toBe(1);
    // Everything else on the same page survives verbatim.
    for (const href of ["/", "/shop", "/collections/dish-brushes", "/faq"]) {
      expect(applyRules("links", href, rules)).toBe(href);
    }
  });

  it("stabilises a dishee card's title text without dropping its anchors", () => {
    // The raw prerendered-text metric is the one no mask can reach, so the
    // rule has to leave the anchor count — the carousel's item count — intact.
    const card = (slug: string, title: string): string =>
      `<div id="related-products-item-0"><a href="/products/${slug}"><img alt="${title}"/></a>` +
      `<a href="/products/${slug}"><h3 class="text-[17px] text-primary line-clamp-2 break-words">${title}</h3></a>` +
      `<p class="text-base text-black">A$9.99</p></div>`;
    const plan = loadPlan(join(plans, "dishee-rehearsal.json"));
    const rules = normalizeForPath(
      "/shop/swedish-dish-cloths/flora/dishee-swedish-dish-cloths-flora-wild",
      plan.normalize,
    );
    const passA = applyRules("all", card("flora-wild", "Flora Wild"), rules);
    const passB = applyRules(
      "all",
      card("patterns-olives", "Patterns Olives"),
      rules,
    );
    expect(htmlToText(passA).length).toBe(htmlToText(passB).length);
    expect(extractAnchorHrefs(passA)).toHaveLength(2);
    expect(extractAnchorHrefs(passB)).toHaveLength(2);
  });

  it("keeps dishee's href rule off the fields that carry the flat product URL", () => {
    // A product page's Product JSON-LD url/@id and its last breadcrumb item
    // point at the flat /products/<slug> URL, and flat -> nested is the
    // headline signal of the port this harness measures. A rule on `all` would
    // have rewritten it.
    const plan = loadPlan(join(plans, "dishee-rehearsal.json"));
    const hrefRule = plan.normalize.find((r) =>
      r.pattern.includes("/products/"),
    );
    expect(hrefRule).toBeDefined();
    expect(hrefRule!.field).toBe("links");
  });
});
