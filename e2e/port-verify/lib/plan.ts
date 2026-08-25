/**
 * Plan loading: turning a store's URL inventory into a capture list.
 *
 * THE FIXTURE LIST IS DATA, NEVER CODE. The harness reads the same
 * `*-url-inventory.json` files `store-parity.spec.ts` reads — same `entries`
 * array, same `path`/`kind`/`excluded` contract, same provenance `.md` beside
 * them. A store's real list therefore slots in with no code change, and the two
 * tools cannot drift onto two different ideas of what a store's URLs are.
 *
 * An OVERLAY is a second, optional file naming an inventory plus the capture
 * directives that are not properties of the URL list: which paths are captured
 * signals-only, which regions are masked, which strings are normalised. Those
 * belong to the comparison, not to the inventory, so they are kept out of the
 * inventory files rather than smuggled into them.
 *
 * FAILS LOUDLY, NEVER QUIETLY EMPTY. A missing, unparseable or zero-entry plan
 * throws. A capture run that reports "no differences" over zero URLs is the
 * exact false green this harness exists to prevent.
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { matchesAny } from "./glob";
import type {
  CaptureMode,
  CaptureTarget,
  MaskRule,
  NormalizeField,
  NormalizeRule,
  SkippedTarget,
} from "./types";

/**
 * Regions masked on EVERY plan. A plan extends this list; it cannot shrink it.
 *
 * Each is a region whose pixels are volatile by construction, and each is a
 * blind spot the report prints. `iframe` is the widest and is deliberate: a
 * third-party frame (a payment element, an embedded map, a video player) is
 * both the least stable thing on any page and the one the harness must never
 * interact with.
 *
 * A plan's `masks` UNION with these, the same way `blocked_hosts` does — see
 * {@link loadPlan}. Choosing between the two lists meant a store that added one
 * mask of its own silently lost all three of these, and the symptom would have
 * been pixel rows on every page carrying an embedded frame: the noisy red GATE
 * 1 exists to prevent, weeks after the mask declaration that caused it and with
 * nothing connecting the two.
 *
 * There is deliberately NO mechanism to remove one, and none to NARROW one
 * either — re-declaring a default selector adopts the plan's `why` but merges
 * `paths` so the default's coverage cannot shrink ({@link unionMasks}). A mask
 * is a declared blind spot, so adding is the safe direction and removing is
 * not; if a store ever genuinely needs it, it gets designed then.
 */
export const DEFAULT_MASKS: readonly MaskRule[] = [
  {
    selector: "iframe",
    why: "Third-party frames (payment elements, maps, embeds) render on their own schedule and are never part of a port's diff.",
    paths: [],
  },
  {
    selector: "video",
    why: "A playing video shows a different frame on every capture.",
    paths: [],
  },
  {
    selector: "[data-port-verify-mask]",
    why: "Explicit opt-out marker a storefront can put on a genuinely volatile element.",
    paths: [],
  },
];

/**
 * Hosts the browser context refuses outright.
 *
 * This is a safety control before it is a determinism control. The harness must
 * make a completed order structurally impossible, and the first line of that is
 * that no payment provider's script is ever loaded on any page this harness
 * opens — not on the checkout page, not anywhere. It is also why the checkout
 * page is captured as a shell rather than as a live payment form, which the
 * report states as a declared blind spot.
 *
 * A plan's `blocked_hosts` is UNIONED with this list and can never replace it.
 * If an opt-out is ever genuinely wanted it has to arrive as a separate,
 * explicitly named key, so that turning a payment host back on is a visible act
 * rather than a side effect of adding an unrelated one.
 */
export const DEFAULT_BLOCKED_HOSTS: readonly string[] = [
  "js.stripe.com",
  "api.stripe.com",
  "m.stripe.com",
  "m.stripe.network",
  "r.stripe.com",
  "hooks.stripe.com",
  "checkout.stripe.com",
  "www.paypal.com",
  "www.paypalobjects.com",
  "pay.google.com",
  "applepay.cdn-apple.com",
];

/** One entry of a `*-url-inventory.json` fixture, as this harness reads it. */
interface InventoryEntry {
  path?: unknown;
  kind?: unknown;
  excluded?: unknown;
  excluded_reason?: unknown;
}

interface InventoryFile {
  name?: unknown;
  entries?: unknown;
}

interface OverlayFile {
  name?: unknown;
  inventory?: unknown;
  add?: unknown;
  signals_only?: unknown;
  exclude?: unknown;
  masks?: unknown;
  normalize?: unknown;
  blocked_hosts?: unknown;
}

/** A fully resolved capture plan. */
export interface CapturePlan {
  readonly name: string;
  readonly planPath: string;
  readonly inventoryPath: string;
  readonly targets: readonly CaptureTarget[];
  readonly skipped: readonly SkippedTarget[];
  readonly masks: readonly MaskRule[];
  readonly normalize: readonly NormalizeRule[];
  readonly blockedHosts: readonly string[];
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `port-verify: cannot read plan file ${path}: ${(err as Error).message}. ` +
        `This harness does not mock and has no fallback data — a run must name a real inventory.`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `port-verify: ${path} is not valid JSON: ${(err as Error).message}`,
    );
  }
}

function asStringArray(value: unknown, what: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error(`port-verify: ${what} must be an array`);
  return value.map((v, i) => {
    if (typeof v !== "string") {
      throw new Error(`port-verify: ${what}[${i}] must be a string`);
    }
    return v;
  });
}

const NORMALIZE_FIELDS: readonly NormalizeField[] = [
  "canonical",
  "og_url",
  "links",
  "jsonld",
  "robots_meta",
  "all",
];

function parseMasks(value: unknown): MaskRule[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error("port-verify: masks must be an array");
  return value.map((raw, i) => {
    const m = raw as { selector?: unknown; why?: unknown; paths?: unknown };
    if (typeof m.selector !== "string" || m.selector.trim() === "") {
      throw new Error(
        `port-verify: masks[${i}].selector must be a non-empty string`,
      );
    }
    if (typeof m.why !== "string" || m.why.trim() === "") {
      throw new Error(
        `port-verify: masks[${i}].why is required — every masked region is a blind spot ` +
          `this run is choosing, and the report prints the reason beside it.`,
      );
    }
    return {
      selector: m.selector,
      why: m.why,
      paths: asStringArray(m.paths, `masks[${i}].paths`),
    };
  });
}

function parseNormalize(value: unknown): NormalizeRule[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error("port-verify: normalize must be an array");
  return value.map((raw, i) => {
    const r = raw as {
      field?: unknown;
      pattern?: unknown;
      flags?: unknown;
      replace?: unknown;
      why?: unknown;
    };
    if (
      typeof r.field !== "string" ||
      !NORMALIZE_FIELDS.includes(r.field as NormalizeField)
    ) {
      throw new Error(
        `port-verify: normalize[${i}].field must be one of ${NORMALIZE_FIELDS.join(", ")}`,
      );
    }
    if (typeof r.pattern !== "string" || r.pattern === "") {
      throw new Error(
        `port-verify: normalize[${i}].pattern must be a non-empty string`,
      );
    }
    if (typeof r.replace !== "string") {
      throw new Error(`port-verify: normalize[${i}].replace must be a string`);
    }
    if (typeof r.why !== "string" || r.why.trim() === "") {
      throw new Error(
        `port-verify: normalize[${i}].why is required — a normalisation rule is a blind spot ` +
          `and the report prints the reason beside it.`,
      );
    }
    const flags = r.flags === undefined ? "g" : r.flags;
    if (typeof flags !== "string") {
      throw new Error(`port-verify: normalize[${i}].flags must be a string`);
    }
    return {
      field: r.field as NormalizeField,
      pattern: r.pattern,
      flags,
      replace: r.replace,
      why: r.why,
    };
  });
}

function parseAdded(value: unknown, planPath: string): InventoryEntry[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error(`port-verify: ${planPath} \`add\` must be an array`);
  return value.map((raw, i) => {
    const e = raw as InventoryEntry;
    if (typeof e.path !== "string" || !e.path.startsWith("/")) {
      throw new Error(
        `port-verify: ${planPath} add[${i}].path must be a path starting "/"`,
      );
    }
    return e;
  });
}

/**
 * Load a plan from either an inventory fixture directly or an overlay naming
 * one. Both forms are supported so a store with nothing to declare needs no
 * second file.
 */
export function loadPlan(planPath: string): CapturePlan {
  const absPlan = resolve(planPath);
  const raw = readJson(absPlan) as OverlayFile & InventoryFile;

  const isOverlay = typeof raw.inventory === "string";
  const inventoryPath = isOverlay
    ? isAbsolute(raw.inventory as string)
      ? (raw.inventory as string)
      : resolve(dirname(absPlan), raw.inventory as string)
    : absPlan;

  const inventory = (
    isOverlay ? readJson(inventoryPath) : raw
  ) as InventoryFile;
  const entries = inventory.entries;
  if (!Array.isArray(entries)) {
    throw new Error(
      `port-verify: ${inventoryPath} has no \`entries\` array. This harness reads the same ` +
        `url-inventory contract as store-parity.spec.ts.`,
    );
  }
  if (entries.length === 0) {
    throw new Error(
      `port-verify: ${inventoryPath} has zero entries. A run over zero URLs would report ` +
        `"no differences" and mean nothing — refusing rather than reporting a false green.`,
    );
  }

  /**
   * Extra URLs the inventory does not carry.
   *
   * The store inventories were captured from the V1 sites and list only the
   * URLs those sites served, so the shapes whose STATUS is the thing under test
   * — the flat product URL that becomes a 308, a guaranteed-missing URL in each
   * route family — are absent from them by construction. They are declared
   * here, in the overlay, rather than edited into a captured inventory whose
   * provenance document states what it swept and when.
   */
  const added = parseAdded(raw.add, absPlan);

  const signalsOnly = asStringArray(raw.signals_only, "signals_only");
  const excludeGlobs = asStringArray(raw.exclude, "exclude");
  const masks = parseMasks(raw.masks);
  const normalize = parseNormalize(raw.normalize);
  const blockedHosts = asStringArray(raw.blocked_hosts, "blocked_hosts");

  const targets: CaptureTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const seen = new Set<string>();

  [...entries, ...added].forEach((rawEntry, i) => {
    const entry = rawEntry as InventoryEntry;
    if (typeof entry.path !== "string" || !entry.path.startsWith("/")) {
      throw new Error(
        `port-verify: ${inventoryPath} entries[${i}].path must be a site-relative path starting "/"`,
      );
    }
    const path = entry.path;
    const kind = typeof entry.kind === "string" ? entry.kind : "unknown";
    if (seen.has(path)) {
      skipped.push({ path, reason: "duplicate path in the inventory" });
      return;
    }
    seen.add(path);
    if (entry.excluded === true) {
      const why =
        typeof entry.excluded_reason === "string" &&
        entry.excluded_reason !== ""
          ? entry.excluded_reason
          : "marked excluded in the inventory";
      skipped.push({ path, reason: why });
      return;
    }
    if (matchesAny(path, excludeGlobs)) {
      skipped.push({ path, reason: "matched the plan's `exclude` globs" });
      return;
    }
    const mode: CaptureMode = matchesAny(path, signalsOnly)
      ? "signals"
      : "full";
    targets.push({ path, kind, mode });
  });

  if (targets.length === 0) {
    throw new Error(
      `port-verify: every entry in ${inventoryPath} was excluded — nothing would be captured.`,
    );
  }

  const name =
    (typeof raw.name === "string" && raw.name !== "" ? raw.name : undefined) ??
    (typeof inventory.name === "string" && inventory.name !== ""
      ? inventory.name
      : undefined) ??
    absPlan;

  return {
    name,
    planPath: absPlan,
    inventoryPath,
    targets,
    skipped,
    masks: unionMasks(masks),
    normalize,
    // UNION, NEVER REPLACE. A plan's `blocked_hosts` EXTENDS the payment list;
    // it cannot shrink it. Choosing between the two lists meant a plan that
    // added one unrelated host — a flaky third-party widget, say — silently
    // un-blocked js.stripe.com, checkout.stripe.com, PayPal and Google/Apple
    // Pay for that store, including the dishee plan whose own note records that
    // its Stripe is LIVE against a real merchant account. Fixture data must not
    // be able to defeat a safety control; that is the whole reason control #2
    // in `safety.ts` is code and the fixture list is not.
    blockedHosts: [...new Set([...DEFAULT_BLOCKED_HOSTS, ...blockedHosts])],
  };
}

/**
 * A plan's masks on top of {@link DEFAULT_MASKS}, keyed by selector.
 *
 * A store can restate a default's `why` in its own words — a store-specific
 * reason is worth having — but it CANNOT narrow where a default applies, which
 * is what makes "a plan extends this list; it cannot shrink it" literally true
 * rather than true-except-for-one-loophole.
 *
 * `paths` therefore MERGE with empty-means-everywhere semantics: an empty list
 * means "every captured URL" (see {@link masksForPath}), so if either side is
 * empty the merged entry is empty and keeps applying everywhere. Letting the
 * plan's `paths` win outright would have reached the exact coverage loss the
 * union was introduced to close — `{"selector": "iframe", "paths": ["/book"]}`
 * would leave every other page's embedded frames unmasked — by narrowing
 * instead of by omission, which is harder to notice, not easier.
 *
 * A plan can still path-scope a NEW selector it introduces; that adds a blind
 * spot narrowly, which is the safe direction.
 */
function unionMasks(planMasks: readonly MaskRule[]): MaskRule[] {
  const bySelector = new Map<string, MaskRule>();
  for (const m of DEFAULT_MASKS) bySelector.set(m.selector, m);
  for (const m of planMasks) {
    const existing = bySelector.get(m.selector);
    if (existing === undefined) {
      bySelector.set(m.selector, m);
      continue;
    }
    const widest =
      existing.paths.length === 0 || m.paths.length === 0
        ? []
        : [...new Set([...existing.paths, ...m.paths])];
    bySelector.set(m.selector, { ...m, paths: widest });
  }
  return [...bySelector.values()];
}

/** The masks that apply to one path. */
export function masksForPath(
  path: string,
  masks: readonly MaskRule[],
): readonly MaskRule[] {
  return masks.filter((m) => m.paths.length === 0 || matchesAny(path, m.paths));
}
