import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { TAG } from "./cache-tags";

/**
 * Regression guard for the WordPress side of the revalidation contract
 * (`docs/cache-revalidation-contract.md`): which cache tags each product EVENT
 * in `integrations/wordpress/theme/inc/headkit-webhook.php` sends.
 *
 * The defect this guards is BREADTH. Before captain decision D3 (2026-09-10)
 * every product hook — including the stock hook that fires on every order —
 * appended `headkit:products` and `headkit:route:shop`. `getCachedProduct`
 * (every PDP) and every `getCachedCatalogPage` entry subscribe to
 * `headkit:products`, and `/api/revalidate` expires immediately, so one order
 * expired ~5,000 entries on Bike Society and the catalogue caches were never
 * warm. The contract now splits events in two:
 *
 *   LISTING events (create / publish / unpublish / delete / term change) —
 *     the set of listed products changed: specific tags + the blanket tags.
 *   CONTENT events (stock / price / variation / plain update) —
 *     specific tags ONLY: the product, its category grids (with ancestors),
 *     its brand(s), and the route landings it belongs to.
 *
 * Like `wp-featured-brands-cap.test.ts`, this runs the theme's PHP out of the
 * vitest suite that gates every PR: `tests/revalidation-events-harness.php`
 * shims the WordPress / WooCommerce surface the hooks touch, loads the REAL
 * theme files, drives each hook the way WordPress does, and reports the
 * payloads the Action Scheduler queue would receive. It skips on a developer
 * machine without `php`, and FAILS in CI (where `ubuntu-latest` ships it).
 */

const HARNESS = resolve(
  __dirname,
  "../../../integrations/wordpress/theme/tests/revalidation-events-harness.php",
);

interface Payload {
  paths: string[];
  tags: string[];
  action: string;
  /** Harness-added: the unix time the send was scheduled for. */
  scheduled_at: number;
  /** Harness-added: `scheduled_at` minus the scenario's start time. */
  scheduled_in: number;
}

interface HarnessConfig {
  /** `headkit_revalidation_delay()` with no filter applied. */
  delay: number;
  /** `HK_REST_MAX_AGE_CEILING`. */
  ceiling: number;
  /** `HK_REVALIDATE_DELAY_MARGIN`. */
  margin: number;
  /** Every `max_age` literal the harness read out of `inc/rest-api/`. */
  rest_max_ages: Record<string, number>;
  /** Call sites whose `max_age` could not be read statically. */
  rest_max_ages_unreadable: string[];
}

type HarnessResult = Record<string, Payload[]>;

interface HarnessOutput {
  events: HarnessResult;
  config: HarnessConfig;
}

const BLANKET = [TAG.products, TAG.route("shop")] as const;

/** Every tag the e-bike fixture's CONTENT events must reach — and no more. */
const EBIKE_CONTENT_TAGS = [
  TAG.product("e-bike"),
  TAG.catalogCat("electric-bikes"),
  TAG.catalogCat("bikes"), // ancestor grid: /collections/bikes lists it too
  TAG.brand("trek"),
  TAG.route("sale"),
  TAG.route("home"),
];

/** The e-bike fixture's LISTING events add the blanket + collection entity tags. */
const EBIKE_LISTING_TAGS = [
  ...EBIKE_CONTENT_TAGS,
  TAG.collection("electric-bikes"),
  TAG.collection("bikes"),
  ...BLANKET,
];

const EBIKE_PATHS = ["/products/e-bike", "/collections/bikes/electric-bikes"];

function hasPhp(): boolean {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PHP_AVAILABLE = hasPhp();
const IS_CI = Boolean(process.env.CI);

const SUITE = "WordPress theme: product revalidation events";
const SKIPPING = !PHP_AVAILABLE && !IS_CI;
const SUITE_TITLE = SKIPPING
  ? `${SUITE} [skipped: requires \`php\` on PATH]`
  : SUITE;

let result: HarnessResult;
let config: HarnessConfig;

function only(name: string): Payload {
  const sends = result[name];
  expect(sends, `${name}: harness scenario missing`).toBeDefined();
  expect(sends, `${name}: expected exactly one send`).toHaveLength(1);
  return sends![0]!;
}

function expectSameSet(actual: string[], expected: readonly string[]): void {
  expect([...actual].sort()).toEqual([...expected].sort());
}

describe.skipIf(SKIPPING)(SUITE_TITLE, () => {
  beforeAll(() => {
    if (!PHP_AVAILABLE) {
      throw new Error(
        "`php` is not on PATH. CI is expected to provide it — `ubuntu-latest` " +
          "ships PHP preinstalled — so this suite fails rather than skipping.",
      );
    }
    const stdout = execFileSync("php", [HARNESS], { encoding: "utf8" });
    const parsed = JSON.parse(stdout) as HarnessOutput;
    result = parsed.events;
    config = parsed.config;
  });

  describe("CONTENT events send the specific tags only", () => {
    it.each([
      "stock_change",
      "stock_change_variation",
      "price_change",
      "variation_update",
      "update",
    ])("%s", (scenario) => {
      const send = only(scenario);
      expectSameSet(send.tags, EBIKE_CONTENT_TAGS);
      for (const tag of BLANKET) {
        expect(send.tags, `${scenario} must not fire ${tag}`).not.toContain(
          tag,
        );
      }
      // Every path the theme sent before D3 is still sent.
      expectSameSet(send.paths, EBIKE_PATHS);
    });

    it("a variation's stock change purges the PARENT slug, never the variation", () => {
      expect(only("stock_change_variation").tags).toContain(
        TAG.product("e-bike"),
      );
    });

    it("carries the route landings the product belongs to (new / featured / home)", () => {
      const send = only("stock_change_new_featured");
      expectSameSet(send.tags, [
        TAG.product("abus-lock"),
        TAG.catalogCat("locks"),
        TAG.route("new"),
        TAG.route("featured"),
        TAG.route("home"),
      ]);
    });

    it("sends nothing for a draft product or a non-price prop update", () => {
      expect(result["stock_change_draft"]).toEqual([]);
      expect(result["non_price_props"]).toEqual([]);
    });

    it("labels the payload with the event", () => {
      expect(only("stock_change").action).toBe("stock_change");
      expect(only("price_change").action).toBe("price_change");
      expect(only("variation_update").action).toBe("variation_update");
      expect(only("update").action).toBe("update");
    });
  });

  describe("LISTING events add headkit:products + headkit:route:shop", () => {
    it.each([
      ["create", "create"],
      ["publish", "publish"],
      ["unpublish", "unpublish"],
      ["trash", "unpublish"],
      ["delete", "delete"],
    ])("%s", (scenario, action) => {
      const send = only(scenario);
      expectSameSet(send.tags, EBIKE_LISTING_TAGS);
      expectSameSet(send.paths, EBIKE_PATHS);
      expect(send.action).toBe(action);
    });

    it("the publish marker is consumed by the save that follows it", () => {
      const send = only("publish_marker_is_consumed");
      expect(send.action).toBe("update");
      expectSameSet(send.tags, EBIKE_CONTENT_TAGS);
    });

    it("a category change purges the OLD category grids and collection pages too", () => {
      const send = only("category_change_via_save");
      expect(send.action).toBe("terms");
      expectSameSet(send.tags, [
        TAG.product("e-bike"),
        TAG.catalogCat("locks"),
        TAG.collection("locks"),
        TAG.catalogCat("electric-bikes"),
        TAG.collection("electric-bikes"),
        TAG.catalogCat("bikes"),
        TAG.collection("bikes"),
        TAG.brand("trek"),
        TAG.route("sale"),
        TAG.route("home"),
        ...BLANKET,
      ]);
      expectSameSet(send.paths, [
        "/products/e-bike",
        "/collections/locks",
        "/collections/bikes/electric-bikes",
      ]);
    });

    it("a brand change through the WooCommerce CRUD (no save_post) still purges the old brand", () => {
      const send = only("brand_change_via_crud");
      expect(send.action).toBe("terms");
      expect(send.tags).toContain(TAG.brand("trek"));
      for (const tag of BLANKET) expect(send.tags).toContain(tag);
    });

    it("hiding a product from the catalogue is a listing event", () => {
      const send = only("exclude_from_catalog");
      expect(send.action).toBe("terms");
      for (const tag of BLANKET) expect(send.tags).toContain(tag);
    });
  });

  describe("the plural index tags are fired by TAXONOMY hooks only", () => {
    /*
     * Three comments in apps/starter said WordPress fires `headkit:collections`
     * on "any product or category change", and the flat-PDP-breadcrumb decision
     * (`apps/starter/AGENTS.md`) plus the open `260824-nested-pdp-catalogue-purge-tag`
     * both rested on that premise. It is not what the theme does: the product
     * builder sends the SINGULAR `headkit:collection:{slug}` and only on a
     * listing event, while `HK_TAG_COLLECTIONS` appears in
     * `headkit_resolve_endpoint_tags` alone, reachable only from
     * `created_term` / `edited_term` / `delete_term` on `product_cat`
     * (`product_brand` for `headkit:brands`). So an entry that subscribes to
     * TAG.collections is purged by a category term edit — never by a product
     * save, however often that save fires.
     */
    it("no product event fires headkit:collections or headkit:brands", () => {
      const productScenarios = Object.keys(result).filter(
        (name) =>
          !name.startsWith("category_term_") && name !== "brand_term_edit",
      );
      expect(productScenarios.length).toBeGreaterThan(20);
      for (const name of productScenarios) {
        for (const send of result[name] ?? []) {
          expect(
            send.tags,
            `${name} must not fire the collections index — that tag is on the home page, the sitemap, the nested /shop route and every category shell`,
          ).not.toContain(TAG.collections);
          expect(
            send.tags,
            `${name} must not fire the brands index`,
          ).not.toContain(TAG.brands);
        }
      }
    });

    it.each(["category_term_edit", "category_term_delete"])(
      "%s fires the collections index, the edited category and home",
      (scenario) => {
        const send = only(scenario);
        expectSameSet(send.tags, [
          TAG.collections,
          TAG.collection("electric-bikes"),
          TAG.route("home"),
        ]);
      },
    );

    it("a brand term edit fires the brands index, not the collections index", () => {
      const send = only("brand_term_edit");
      expectSameSet(send.tags, [
        TAG.brands,
        TAG.brand("trek"),
        TAG.route("home"),
      ]);
    });
  });

  describe("term-change detection", () => {
    it("an unchanged term set (replace or append) sends nothing", () => {
      expect(result["term_noop"]).toEqual([]);
      expect(result["term_append_noop"]).toEqual([]);
    });

    it("the featured star is a content event that reaches the Featured landing", () => {
      const on = only("featured_toggle_on");
      expect(on.action).toBe("update");
      expect(on.tags).toContain(TAG.route("featured"));
      expect(on.tags).toContain(TAG.route("home"));
      for (const tag of BLANKET) expect(on.tags).not.toContain(tag);

      const off = only("featured_toggle_off");
      expect(off.action).toBe("update");
      expect(off.tags).toContain(TAG.route("featured"));
      for (const tag of BLANKET) expect(off.tags).not.toContain(tag);
    });

    it("WooCommerce's outofstock visibility term is a stock side effect and sends nothing", () => {
      expect(result["outofstock_visibility"]).toEqual([]);
    });

    it("a flush with no marker, or on a draft, sends nothing", () => {
      expect(result["flush_without_marker"]).toEqual([]);
      expect(result["term_change_on_draft"]).toEqual([]);
    });
  });

  /*
   * The send is DELAYED, and the delay is derived rather than guessed.
   *
   * A purge fired at save time races the theme's own REST cache: the storefront
   * entries are deleted, a request seconds later re-renders, and that render
   * reads a `headkit/v2` response still inside its `s-maxage` window — so it
   * regenerates with PRE-EDIT data and pins it in a long-lived entry where
   * nothing expires it. Measured on the Bike Society rehearsal store on
   * 2026-09-21 (tigerheart-studios/bikesociety-v2#65): two PDP URLs for the same
   * renamed product, both regenerated AFTER an accepted purge, seven seconds
   * apart, one carrying the new name and one the old.
   *
   * The delay is the fix, and the number is only as trustworthy as its
   * derivation: the harness tokenises every `headkit_rest_cached_response()`
   * call in `inc/rest-api/` and reports the `max_age` each one publishes, so
   * raising one anywhere in the theme fails this suite until
   * `HK_REST_MAX_AGE_CEILING` is raised with it. That is what stops the delay
   * silently falling back inside a window it exists to clear.
   */
  describe("the send is delayed past every REST cache window", () => {
    it("every headkit/v2 max_age is statically readable", () => {
      // A call the scan cannot read is a window it cannot bound. Make the
      // max_age an integer literal, or raise the ceiling deliberately.
      expect(config.rest_max_ages_unreadable).toEqual([]);
      expect(Object.keys(config.rest_max_ages).length).toBeGreaterThan(5);
    });

    it("the ceiling is the largest max_age the theme actually publishes", () => {
      const largest = Math.max(...Object.values(config.rest_max_ages));
      expect(
        config.ceiling,
        `HK_REST_MAX_AGE_CEILING must equal the largest headkit/v2 max_age (${largest}s). ` +
          `Raising a max_age without raising the ceiling reinstates the purge/cache race.`,
      ).toBe(largest);
    });

    it("the delay exceeds that ceiling with a margin for clock skew", () => {
      expect(config.delay).toBeGreaterThan(config.ceiling);
      expect(config.delay).toBe(config.ceiling + config.margin);
      expect(config.margin).toBeGreaterThan(0);
    });

    it("a save schedules the send at now + delay, not now", () => {
      const send = only("stock_change");
      expect(send.scheduled_in).toBeGreaterThanOrEqual(config.delay);
      // The harness clock can tick between the scenario start and the theme's
      // own time() call; nothing larger than that is tolerated.
      expect(send.scheduled_in).toBeLessThanOrEqual(config.delay + 2);
    });

    it("every scheduled send carries the same delay", () => {
      for (const [name, sends] of Object.entries(result)) {
        if (name.startsWith("filtered_delay_")) continue;
        for (const send of sends) {
          expect(
            send.scheduled_in,
            `${name} must not be sent inside a REST cache window`,
          ).toBeGreaterThan(config.ceiling);
        }
      }
    });

    it("rapid identical saves still collapse to ONE scheduled send", () => {
      // A longer window means MORE saves collapse. It must not mean a queue of
      // delayed duplicates.
      const sends = result["rapid_identical_saves"];
      expect(
        sends,
        "three identical saves must schedule one send",
      ).toHaveLength(1);
      expect(sends![0]!.scheduled_in).toBeGreaterThanOrEqual(config.delay);
    });

    it("the headkit_revalidation_delay filter changes the delay", () => {
      const send = only("filtered_delay_custom");
      expect(send.scheduled_in).toBeGreaterThanOrEqual(45);
      expect(send.scheduled_in).toBeLessThanOrEqual(47);
    });

    it("a filtered delay of 0 restores the immediate send", () => {
      const send = only("filtered_delay_zero");
      expect(send.scheduled_in).toBeGreaterThanOrEqual(0);
      expect(send.scheduled_in).toBeLessThanOrEqual(2);
    });
  });
});
