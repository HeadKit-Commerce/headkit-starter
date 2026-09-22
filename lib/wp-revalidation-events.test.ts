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
  /** `headkit_revalidation_repair_delay()` with no filter applied. */
  repair_delay: number;
  /** `HK_REVALIDATE_RENDER_CEILING`. */
  render_ceiling: number;
  /** `HK_REVALIDATE_REPAIR_SUFFIX` — what marks a send as the repair. */
  repair_suffix: string;
  /** Every `max_age` literal the harness read out of `inc/rest-api/`. */
  rest_max_ages: Record<string, number>;
  /** Call sites whose `max_age` or endpoint name could not be read statically. */
  rest_max_ages_unreadable: string[];
  /** Call site label => the stable endpoint name it publishes under. */
  rest_endpoints: Record<string, string>;
  /** `headkit_rest_cache_endpoints()` — the documented filter surface. */
  rest_endpoints_declared: string[];
  /** `HK_REST_DEFAULT_MAX_AGE`. */
  rest_default_max_age: number;
}

/** Facet-cache observations the harness records around each scenario. */
interface FiltersObservation {
  generation_before: number;
  generation_after: number;
  /** Whether the key a cached payload was stored under is still the lookup key. */
  key_changed: boolean;
  /** Whether a payload cached before the event is still reachable after it. */
  lookup_hits: boolean;
}

type HarnessResult = Record<string, Payload[]>;

interface HarnessOutput {
  events: HarnessResult;
  filters: Record<string, FiltersObservation>;
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
let filters: Record<string, FiltersObservation>;
let config: HarnessConfig;

/**
 * Every send a scenario produced, first sends and repair sends alike.
 *
 * Since 2026-09-22 an event schedules TWO sends: the first carries the whole
 * payload, and the stale-set repair carries its entity tags one render ceiling
 * later. The two are told apart by the action label, which is the real
 * mechanism — it is what keeps Action Scheduler's (hook, args, group) dedupe
 * from collapsing the repair into the send it follows — so the tests below
 * assert on the same field the theme relies on.
 */
function sendsOf(name: string): Payload[] {
  const sends = result[name];
  expect(sends, `${name}: harness scenario missing`).toBeDefined();
  return sends!;
}

function isRepair(send: Payload): boolean {
  return send.action.endsWith(config.repair_suffix);
}

/** The FIRST sends of a scenario — what the tag-breadth contract is about. */
function firstSends(name: string): Payload[] {
  return sendsOf(name).filter((s) => !isRepair(s));
}

/** The stale-set repair sends of a scenario. */
function repairSends(name: string): Payload[] {
  return sendsOf(name).filter(isRepair);
}

function only(name: string): Payload {
  const sends = firstSends(name);
  expect(sends, `${name}: expected exactly one first send`).toHaveLength(1);
  return sends[0]!;
}

function onlyRepair(name: string): Payload {
  const sends = repairSends(name);
  expect(sends, `${name}: expected exactly one repair send`).toHaveLength(1);
  return sends[0]!;
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
    filters = parsed.filters;
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
        if (name.startsWith("repair_")) continue;
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
      const sends = firstSends("rapid_identical_saves");
      expect(
        sends,
        "three identical saves must schedule one send",
      ).toHaveLength(1);
      expect(sends[0]!.scheduled_in).toBeGreaterThanOrEqual(config.delay);
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

    it("every call site publishes under a stable, tunable endpoint name", () => {
      // The name is the key of the per-endpoint tuning filter. A call site
      // without one is a lifetime no store can change without a theme release,
      // which on a managed host is hours while the defect is live.
      const scanned = Object.keys(config.rest_max_ages).filter(
        (label) => !label.endsWith(":HK_REST_DEFAULT_MAX_AGE"),
      );
      for (const label of scanned) {
        expect(
          config.rest_endpoints[label],
          `${label}: no endpoint name`,
        ).toBeTruthy();
      }
      // `headkit_rest_cache_endpoints()` is what a store reads to find the hook
      // names; a name only at a call site is not documentation.
      const used = [...new Set(Object.values(config.rest_endpoints))].sort();
      expect(used).toEqual([...config.rest_endpoints_declared].sort());
    });

    it("the default lifetime is 10s and every endpoint publishes it", () => {
      // The payoff: with the largest lifetime at 10s the delay is 30s, so an
      // editor sees their change in about half a minute instead of six minutes.
      expect(config.rest_default_max_age).toBe(10);
      for (const [label, maxAge] of Object.entries(config.rest_max_ages)) {
        expect(maxAge, `${label}: not the 10s default`).toBe(10);
      }
      expect(config.ceiling).toBe(10);
      expect(config.delay).toBe(30);
    });
  });

  /**
   * The SECOND, stale-set repair send (2026-09-22, issue #65 repair half).
   *
   * The first send's delay narrows the race between a purge and the caches
   * upstream of a render. It cannot close it, because the surviving race is
   * against our OWN render duration: a render that starts before the purge and
   * finishes after it writes pre-edit data into an entry the framework then
   * accepts as fresh, and under `cacheLife("max")` nothing expires it. Measured
   * 2026-09-22 — two renders of one product five seconds apart, off the same
   * purge, against an origin that already held the new value, disagreeing about
   * the product's name.
   *
   * The remedy is the delayed double delete: purge again after the slowest fill
   * the first purge could have started. Three ways it could be a silent no-op,
   * and one assertion here for each:
   *
   *   1. Action Scheduler dedupes on (hook, args, group) and `action` is part of
   *      `args`, so an identical payload is collapsed into the first send with
   *      nothing logged. The label suffix is what prevents it.
   *   2. Re-sending the WIDE tags would multiply every save by the size of the
   *      catalogue against a 1.8 req/s origin bucket. Entity tags only.
   *   3. Re-deriving the delay instead of inheriting it would strand the repair
   *      in front of the purge it repairs on any store that tunes the first.
   */
  describe("a second, delayed purge repairs the stale set", () => {
    it("a product save schedules two sends, not one", () => {
      expect(sendsOf("stock_change")).toHaveLength(2);
      expect(firstSends("stock_change")).toHaveLength(1);
      expect(repairSends("stock_change")).toHaveLength(1);
    });

    it("the repair carries the entity tags and nothing else", () => {
      // The first send reaches six tags; five of them are grids, landings and a
      // brand, which between them reach thousands of entries on a real store.
      expectSameSet(only("stock_change").tags, EBIKE_CONTENT_TAGS);
      expectSameSet(onlyRepair("stock_change").tags, [TAG.product("e-bike")]);
    });

    it("a LISTING event's repair is still just the entity tag", () => {
      // `create` adds the blanket tags and both collection tags. None of them
      // may ride the second send — this is the assertion that keeps the cost at
      // ~4 extra origin reads per save instead of thousands.
      expectSameSet(only("create").tags, EBIKE_LISTING_TAGS);
      expectSameSet(onlyRepair("create").tags, [TAG.product("e-bike")]);
    });

    it("collection and brand tags are NOT entity tags", () => {
      // They look like entity tags and are not: they name the product-SET
      // domain, ride every product save, and reach whole grids. On Bike Society
      // one brand tag reaches ~1,100 /shop entries.
      const repaired = onlyRepair("create").tags;
      expect(repaired).not.toContain(TAG.collection("electric-bikes"));
      expect(repaired).not.toContain(TAG.collection("bikes"));
      expect(repaired).not.toContain(TAG.brand("trek"));
      expect(repaired).not.toContain(TAG.catalogCat("bikes"));
      expect(repaired).not.toContain(TAG.route("home"));
      expect(repaired).not.toContain(TAG.products);
    });

    it("the repair sends no paths", () => {
      // `revalidatePath()` takes no lifetime and is an unconditional delete, and
      // a product's path and its product tag are built from the same object in
      // the same function — so the entity tag already covers the page the path
      // names, and re-sending it would be a second delete of the same entries.
      expect(only("stock_change").paths).toEqual(EBIKE_PATHS);
      expect(onlyRepair("stock_change").paths).toEqual([]);
    });

    it("the repair is scheduled at first delay + the render ceiling", () => {
      expect(config.repair_delay).toBe(config.delay + config.render_ceiling);
      const repair = onlyRepair("stock_change");
      expect(repair.scheduled_in).toBeGreaterThanOrEqual(config.repair_delay);
      expect(repair.scheduled_in).toBeLessThanOrEqual(config.repair_delay + 2);
    });

    it("the repair always lands AFTER the send it repairs", () => {
      // The one property that makes it a repair rather than a second purge.
      for (const name of Object.keys(result)) {
        for (const repair of repairSends(name)) {
          for (const first of firstSends(name)) {
            expect(
              repair.scheduled_in,
              `${name}: the repair must follow the send it repairs`,
            ).toBeGreaterThan(first.scheduled_in);
          }
        }
      }
    });

    it("the render ceiling clears the slowest render actually measured", () => {
      // Provenance for 120: cold facet render 3.3-5.3s, foreground PDP
      // re-render ~5.8s, worst observed 13.85s. Too short and the repair fires
      // before the slow render finished, so the stale set survives and the whole
      // mechanism is a no-op; too long only delays convergence.
      expect(config.render_ceiling).toBeGreaterThan(13.85);
      expect(config.render_ceiling).toBe(120);
    });

    it("the repair inherits a filtered first delay rather than re-deriving", () => {
      // A store that tunes `headkit_revalidation_delay` must move both sends.
      const first = only("repair_follows_filtered_first_delay");
      const repair = onlyRepair("repair_follows_filtered_first_delay");
      expect(first.scheduled_in).toBeGreaterThanOrEqual(45);
      expect(repair.scheduled_in).toBeGreaterThanOrEqual(
        45 + config.render_ceiling,
      );
      expect(repair.scheduled_in).toBeLessThanOrEqual(
        45 + config.render_ceiling + 2,
      );
    });

    it("the headkit_revalidation_repair_delay filter moves the repair alone", () => {
      const repair = onlyRepair("repair_filtered_custom");
      expect(repair.scheduled_in).toBeGreaterThanOrEqual(90);
      expect(repair.scheduled_in).toBeLessThanOrEqual(92);
      // ...and the first send is untouched by it.
      const first = only("repair_filtered_custom");
      expect(first.scheduled_in).toBeGreaterThanOrEqual(config.delay);
      expect(first.scheduled_in).toBeLessThanOrEqual(config.delay + 2);
    });

    it("a repair filtered to the first delay is not scheduled at all", () => {
      // A second purge at or before the one it repairs cannot observe the fill
      // that one triggers: it costs origin reads and buys nothing.
      expect(repairSends("repair_disabled_by_filter")).toHaveLength(0);
      expect(firstSends("repair_disabled_by_filter")).toHaveLength(1);
    });

    it("an event with no entity tags schedules no repair", () => {
      // A menu edit, a branding change, a category or brand term edit: there is
      // no entity page to repair, so a second send would be pure cost.
      for (const name of [
        "menu_save",
        "branding_change",
        "category_term_edit",
        "category_term_delete",
        "brand_term_edit",
      ]) {
        expect(
          repairSends(name),
          `${name}: has no entity tag and must schedule no repair`,
        ).toHaveLength(0);
        expect(firstSends(name).length).toBeGreaterThan(0);
      }
    });

    it("an event that sends nothing schedules no repair either", () => {
      for (const name of [
        "stock_change_draft",
        "non_price_props",
        "term_noop",
        "term_change_on_draft",
      ]) {
        expect(result[name]).toEqual([]);
      }
    });

    it("CMS content pages and posts are repaired too", () => {
      expectSameSet(onlyRepair("page_save").tags, [TAG.page("shipping")]);
      expectSameSet(onlyRepair("post_save").tags, [TAG.post("launch")]);
      // A news save emits a second, index-only payload; it carries no entity tag
      // and gets no repair, so the scenario is 2 first sends + 1 repair.
      expect(firstSends("post_save")).toHaveLength(2);
      expect(repairSends("post_save")).toHaveLength(1);
    });

    it("the two sends are not dedupable, even when the payloads match", () => {
      // THE CASE THE ACTION LABEL EXISTS FOR. A faq CPT save emits
      // `headkit:page:faq` and no path, so the repair payload is identical to
      // the first in every field Action Scheduler keys on EXCEPT the label.
      // Without the suffix the two collapse and the repair silently never
      // happens — on this event only, which is the shape that survives review.
      const first = only("faq_save");
      const repair = onlyRepair("faq_save");
      expect(repair.tags).toEqual(first.tags);
      expect(repair.paths).toEqual(first.paths);
      expect(repair.action).not.toBe(first.action);
      expect(repair.action).toBe(`${first.action}${config.repair_suffix}`);
      // Both were really scheduled — the assertion above would pass vacuously
      // against a collapsed queue.
      expect(sendsOf("faq_save")).toHaveLength(2);
    });

    it("rapid identical saves collapse the repair too", () => {
      // The repair INHERITS the first send's coalescing rather than defeating
      // it: three identical saves are one send and one repair, not three of
      // each. This is what keeps a bulk edit or an importer run inside the
      // origin's 1.8 req/s budget.
      expect(repairSends("rapid_identical_saves")).toHaveLength(1);
      expect(sendsOf("rapid_identical_saves")).toHaveLength(2);
    });
  });

  /*
   * PART 2 of the same defect: a cache INSIDE WordPress that no `Cache-Control`
   * value can reach. `headkit-product-filters.php` caches the facet payload in
   * a transient, and until 0.4.63 nothing ever deleted it — so a product save
   * left the facet sidebar stale in WordPress for up to its full TTL, under
   * whatever the header said.
   *
   * The key is namespaced by a generation (the key space is an md5 over request
   * arguments, so there is no name to delete, and a wp_options sweep would find
   * nothing at all on a store with an external object cache). "Flushed" is
   * therefore asserted as a real lookup: the harness caches a payload before
   * each scenario and checks whether the endpoint would still find it after.
   */
  describe("the facet transient is invalidated by the same events", () => {
    function observe(name: string): FiltersObservation {
      const seen = filters[name];
      expect(
        seen,
        `${name}: harness recorded no facet observation`,
      ).toBeDefined();
      return seen!;
    }

    it("every event that sends a revalidation also flushes it", () => {
      for (const [name, sends] of Object.entries(result)) {
        if (sends.length === 0) continue;
        const seen = observe(name);
        const tags = sends.flatMap((send) => send.tags);
        const touchesCatalogue = tags.some(
          (tag) =>
            tag === TAG.products ||
            tag === TAG.collections ||
            tag === TAG.brands ||
            tag === TAG.catalog ||
            tag.startsWith("headkit:product:") ||
            tag.startsWith("headkit:collection:") ||
            tag.startsWith("headkit:brand:") ||
            tag.startsWith("headkit:catalog:"),
        );
        if (!touchesCatalogue) continue;
        expect(
          seen.lookup_hits,
          `${name}: a facet payload cached before the save survived it`,
        ).toBe(false);
        expect(seen.generation_after).toBeGreaterThan(seen.generation_before);
      }
    });

    it("a product save flushes it", () => {
      expect(observe("update").lookup_hits).toBe(false);
      expect(observe("stock_change").lookup_hits).toBe(false);
      expect(observe("price_change").lookup_hits).toBe(false);
    });

    it("a category or brand term change flushes it", () => {
      // The facet payload IS the category / brand / attribute counts.
      expect(observe("category_term_edit").lookup_hits).toBe(false);
      expect(observe("category_term_delete").lookup_hits).toBe(false);
      expect(observe("brand_term_edit").lookup_hits).toBe(false);
      expect(observe("category_change_via_save").lookup_hits).toBe(false);
      expect(observe("brand_change_via_crud").lookup_hits).toBe(false);
    });

    it("a menu or branding edit does NOT flush it", () => {
      // A flush bound to "any revalidation" would recount every category,
      // brand and attribute in the catalogue each time somebody moved a footer
      // link. That is the version of this fix people delete.
      for (const name of ["menu_save", "branding_change"]) {
        const seen = observe(name);
        expect(seen.lookup_hits, `${name}: flushed the facet cache`).toBe(true);
        expect(seen.generation_after).toBe(seen.generation_before);
      }
      // ...and both of them really did send something, or the assertion above
      // would pass for the wrong reason.
      expect(result["menu_save"]!.length).toBe(1);
      expect(result["branding_change"]!.length).toBe(1);
    });

    it("an event that sends nothing flushes nothing", () => {
      for (const name of [
        "term_noop",
        "flush_without_marker",
        "term_change_on_draft",
        "stock_change_draft",
      ]) {
        expect(result[name]).toEqual([]);
        expect(observe(name).lookup_hits, `${name}: flushed on a no-op`).toBe(
          true,
        );
      }
    });

    it("flushes once per EVENT even when the sends deduplicate", () => {
      // Three identical saves collapse into one scheduled send because the send
      // carries no data. A cache flush is not deduplicable the same way.
      const seen = observe("rapid_identical_saves");
      expect(firstSends("rapid_identical_saves")).toHaveLength(1);
      expect(seen.generation_after - seen.generation_before).toBe(3);
    });
  });
});
