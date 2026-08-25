/**
 * The comparison engine.
 *
 * ORDERED FOR TRIAGE, NOT FOR TIDINESS. A canonical tag that flipped and a
 * two-pixel font shift are not the same size of event, and a report that lists
 * them in file order buries the first under the second. Rows therefore carry a
 * group, groups have a fixed severity order, and the renderer prints them in
 * that order: what a page IS first, what a page LOOKS LIKE last.
 *
 * PURE. Everything here is a function of two loaded capture records. Pixel rows
 * are produced by the caller (which owns the file reads) and appended; keeping
 * the signal comparison free of IO is what lets it be tested exhaustively.
 */

import { ORIGIN_TOKEN, normalizeOrigins, reduceOriginHref } from "./normalize";
import type {
  CaptureEntry,
  CaptureRun,
  CaptureRunMeta,
  JsonLdNode,
} from "./types";

/** Difference kinds, most consequential first. */
export const DIFF_GROUPS = [
  "comparability",
  "capture",
  "undetermined",
  "redirect",
  "indexing",
  "structured-data",
  "links",
  "nojs",
  "cache",
  "pixel",
] as const;

export type DiffGroup = (typeof DIFF_GROUPS)[number];

/** Human-facing titles and the reason each group sits where it does. */
export const GROUP_TITLES: Record<DiffGroup, string> = {
  comparability: "Whether these two runs are comparable at all",
  capture: "Capture coverage",
  undetermined: "Fields this pair cannot determine",
  redirect: "Status and redirect chain",
  indexing: "Indexing signals",
  "structured-data": "Structured data (JSON-LD)",
  links: "Internal links",
  nojs: "Rendering without JavaScript",
  cache: "Cache and prerender headers",
  pixel: "Screenshots",
};

export const GROUP_NOTES: Record<DiffGroup, string> = {
  comparability:
    "The two runs were captured by different procedures or under different settings, so a difference below may describe the HARNESS rather than the storefront — and an absence of differences proves nothing. Re-capture both sides with one build and one set of options before reading anything else here.",
  capture:
    "A URL present in one run and not the other, or one that failed to capture.",
  undetermined:
    "NOT differences — a coverage gap, and one that exists only because the two runs swept DIFFERENT origins. Capture rewrites each run's own origin to the literal token `{origin}`, so across two hosts that token no longer names the same real origin on both sides: two values that agree here may be two different origins agreeing only in shape. An origin regression — a canonical, og:url or JSON-LD node that started naming the sweep host instead of the store's configured domain — is precisely what that would hide, and it is one of the changes being ported. Reporting these as matches would be the false green this instrument exists to prevent, so they are reported as UNDETERMINED instead: not verified either way. Yes, this is several rows per URL and it is verbose. That is the honest cost of a mode that cannot verify these fields, and it is deliberate — a cross-origin pair cannot produce a determinate verdict on an origin-bearing signal. Capture both runs against the SAME host to get one.",
  redirect:
    "Final status and every hop. A 308 and a 200 carrying a client-side redirect are recorded separately and never collapse into each other.",
  indexing:
    "Document title, canonical, og:url, the robots meta tag, the robots.txt verdict for the path, and sitemap membership. Every one of these renders pixel-identical or nearly so.",
  "structured-data": "Every JSON-LD @type, url and @id on the page.",
  links: "Rendered in-page href values, normalised to site-relative paths.",
  nojs: "What a client running no JavaScript receives and renders. Ink ratio near zero with JavaScript off, against a healthy ratio with it on, is an empty prerendered shell.",
  cache:
    "Recorded, not asserted. x-vercel-cache flips between HIT and MISS on its own schedule; a change from PRERENDER to MISS does not.",
  pixel:
    "Pixel deltas, reported last because a signal change outranks a visual one.",
};

/** One difference. `before`/`after` are the literal captured values. */
export interface DiffRow {
  readonly group: DiffGroup;
  /** The URL path this row belongs to; `*` for run-level rows. */
  readonly key: string;
  readonly field: string;
  readonly before: string;
  readonly after: string;
  /** Extra context — an artifact path, a cap notice — or null. */
  readonly detail: string | null;
}

export interface DiffResult {
  readonly rows: readonly DiffRow[];
  readonly comparedKeys: number;
  readonly onlyInBefore: readonly string[];
  readonly onlyInAfter: readonly string[];
  /**
   * URLs whose capture recorded an error, counted per run and — the one that
   * matters — in BOTH.
   *
   * A URL that failed IDENTICALLY on both sides used to produce no row at all:
   * the error strings are deterministic (`desktop pass: desktop settle exceeded
   * 90000ms`), so the set difference was empty, and every other field was
   * null-on-both, so nothing was reported. The URL then counted as a clean
   * comparison in a report that said "No differences" — the believed false
   * green this harness exists to prevent, arrived at by the harness failing
   * rather than the storefront changing. These are surfaced independently of
   * whether the two error lists match.
   */
  readonly failedInBefore: readonly string[];
  readonly failedInAfter: readonly string[];
  readonly failedInBoth: readonly string[];
  /**
   * Run-level settings that differ between the two captures.
   *
   * Non-empty means nothing below is trustworthy: the pair may be describing
   * the harness rather than the storefront. Surfaced separately from the row
   * list so the report can lead with it.
   */
  readonly comparability: readonly DiffRow[];
}

const ABSENT = "(absent)";

function show(value: string | number | boolean | null): string {
  if (value === null) return ABSENT;
  if (value === "") return "(empty string)";
  return String(value);
}

function row(
  group: DiffGroup,
  key: string,
  field: string,
  before: string | number | boolean | null,
  after: string | number | boolean | null,
  detail: string | null = null,
): DiffRow {
  return {
    group,
    key,
    field,
    before: show(before),
    after: show(after),
    detail,
  };
}

function chainText(entry: CaptureEntry): string {
  if (entry.http.chain.length === 0) return ABSENT;
  return entry.http.chain
    .map(
      (hop) =>
        `${hop.status} ${hop.url}${hop.location === null ? "" : ` -> ${hop.location}`}`,
    )
    .join(" | ");
}

/** robots.txt verdict and sitemap membership rows for one of the two keyings. */
function indexingByPathRows(
  key: string,
  label: string,
  b: CaptureEntry,
  a: CaptureEntry,
  which: "requested" | "final",
): DiffRow[] {
  const bi = b.indexing[which];
  const ai = a.indexing[which];
  const rows: DiffRow[] = [];
  if (bi.robotsTxt.allowed !== ai.robotsTxt.allowed) {
    rows.push(
      row(
        "indexing",
        key,
        `robots.txt verdict (${label})`,
        bi.robotsTxt.allowed ? "allowed" : "disallowed",
        ai.robotsTxt.allowed ? "allowed" : "disallowed",
        `${bi.path} -> ${ai.path}`,
      ),
    );
  }
  if (bi.robotsTxt.rule !== ai.robotsTxt.rule) {
    rows.push(
      row(
        "indexing",
        key,
        `robots.txt winning rule (${label})`,
        bi.robotsTxt.rule,
        ai.robotsTxt.rule,
        `${bi.path} -> ${ai.path}`,
      ),
    );
  }
  if (bi.inSitemap !== ai.inSitemap) {
    rows.push(
      row(
        "indexing",
        key,
        `present in sitemap.xml (${label})`,
        bi.inSitemap,
        ai.inSitemap,
        `${bi.path} -> ${ai.path}`,
      ),
    );
  }
  return rows;
}

function jsonLdKey(node: JsonLdNode): string {
  return `${node.type} url=${node.url ?? "-"} @id=${node.id ?? "-"}`;
}

/**
 * Set difference reported item by item, capped.
 *
 * A list field reported as "before: [47 items] / after: [46 items]" is unusable;
 * one row per changed item is what a human can act on. The cap keeps a wholesale
 * change (a nav rewrite) from producing hundreds of rows, and says so.
 */
function listRows(
  group: DiffGroup,
  key: string,
  field: string,
  before: readonly string[],
  after: readonly string[],
  cap: number,
): DiffRow[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const removed = before.filter((v) => !afterSet.has(v));
  const added = after.filter((v) => !beforeSet.has(v));
  const rows: DiffRow[] = [];
  for (const v of removed.slice(0, cap))
    rows.push(row(group, key, `${field} removed`, v, null));
  if (removed.length > cap) {
    rows.push(
      row(
        group,
        key,
        `${field} removed`,
        `${removed.length - cap} more`,
        null,
        "list capped",
      ),
    );
  }
  for (const v of added.slice(0, cap))
    rows.push(row(group, key, `${field} added`, null, v));
  if (added.length > cap) {
    rows.push(
      row(
        group,
        key,
        `${field} added`,
        null,
        `${added.length - cap} more`,
        "list capped",
      ),
    );
  }
  return rows;
}

/** How many items of a changed list are printed before the row is capped. */
export const LIST_ROW_CAP = 25;

const UNDETERMINED_DETAIL =
  "the two runs swept different origins, so `{origin}` may stand for a DIFFERENT real origin in each of them; this agreement is not evidence that the two values agree";

function carriesOrigin(value: string | null): boolean {
  return value !== null && value.includes(ORIGIN_TOKEN);
}

/**
 * The row an origin-bearing field earns when it MATCHED but could not be
 * determined.
 *
 * Only ever non-empty on a cross-origin pair, and only when the token is
 * actually present: a value that carries no origin at all is a determinable
 * match and produces nothing, exactly as before. A field that DIFFERS never
 * reaches here — a difference is determinable, and it keeps its own group.
 */
function undeterminedFor(
  crossOrigin: boolean,
  key: string,
  field: string,
  before: string | null,
  after: string | null,
): DiffRow[] {
  if (!crossOrigin) return [];
  if (!carriesOrigin(before) && !carriesOrigin(after)) return [];
  return [row("undetermined", key, field, before, after, UNDETERMINED_DETAIL)];
}

/** The same, for the already-selected members of a list field. */
function undeterminedValueRows(
  crossOrigin: boolean,
  key: string,
  field: string,
  values: readonly string[],
): DiffRow[] {
  if (!crossOrigin) return [];
  const unique = [...new Set(values)];
  const rows = unique
    .slice(0, LIST_ROW_CAP)
    .map((v) => row("undetermined", key, field, v, v, UNDETERMINED_DETAIL));
  if (unique.length > LIST_ROW_CAP) {
    const more = `${unique.length - LIST_ROW_CAP} more`;
    rows.push(
      row(
        "undetermined",
        key,
        field,
        more,
        more,
        `${UNDETERMINED_DETAIL}; list capped`,
      ),
    );
  }
  return rows;
}

/** List members present on BOTH sides that carry the origin token. */
function sharedOriginBearing(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const afterSet = new Set(after);
  return before.filter((v) => afterSet.has(v) && v.includes(ORIGIN_TOKEN));
}

/**
 * Absolute tolerance on the no-JavaScript ink ratio.
 *
 * The ink ratio is a rasterisation-derived measurement, and the screenshots it
 * is computed from already carry a deliberate per-channel tolerance of 2
 * because Chromium's text rasterisation is not bit-identical between processes.
 * Comparing ink by exact float equality gave it no tolerance at all, so
 * sub-threshold jitter that pushed enough sampled pixels across the ink
 * boundary could shift the fourth decimal and raise a SIGNAL-tier row on a
 * target nobody touched — the noisy red that GATE 1 exists to prevent.
 *
 * MEASURED, and the measurement is the point of this docblock:
 *
 *  - Observed jitter across two real-host self-diff pairs (the deployed pebblr
 *    rehearsal storefront) and one synthetic-storefront pair — 63 ink
 *    comparisons spanning desktop, mobile and no-JS screenshots — was EXACTLY
 *    0.000000. Not one comparison moved.
 *  - `inkRatio` rounds to four decimal places (`toFixed(4)` in `png.ts`), so
 *    the measurement quantum is 0.0001.
 *  - The smallest HEALTHY ink ratio observed across those captures was 0.0745.
 *    An empty prerendered shell is a near-total ink loss, so a blank-shell
 *    delta is at least that.
 *
 * 0.001 is therefore headroom over the MEASUREMENT QUANTUM — ten quanta — and
 * NOT a multiple of measured jitter, because no jitter was observed to
 * multiply. It sits 74x below the smallest healthy ink ratio, so the regression
 * this metric exists for (0.0745 or more of ink disappearing) clears it by
 * nearly two orders of magnitude.
 *
 * The row stays in the SIGNAL tier. Ink is the one signal-tier metric that
 * names an empty prerendered shell, which is the regression class the no-JS
 * pass exists for; demoting it to pixels would bury it under font shifts.
 * A sub-epsilon ink move is not invisible either — the no-JS screenshot is
 * pixel-compared in the pixel tier independently of this row.
 */
export const NOJS_INK_EPSILON = 0.001;

/**
 * Run-level settings that have to match for a pair to mean anything.
 *
 * `harnessVersion` is the one that closes the gap this list exists for. It was
 * documented as "bumped when the capture procedure changes in a way that
 * invalidates pairs", but nothing read it: `loadRun` gates only on
 * `schemaVersion`, so a procedure change that leaves the RECORD SHAPE alone —
 * a viewport, the settle timing, the user agent, how masks are injected —
 * compared clean and produced rows describing the harness rather than the
 * storefront. The rest are the settings that decide what a captured value even
 * means: a different clock policy, different normalise rules, different masks,
 * a different set of hosts the page was allowed to load from.
 *
 * THE BASE URL IS DELIBERATELY NOT ON THIS LIST. A cross-origin pair is a
 * supported comparison — the rehearsal host before a cutover against the live
 * domain after it is the clearest case — and refusing to trust one would
 * contradict the unconditional origin normalisation `normalize.ts` performs for
 * exactly that reason. So the origins are reconciled instead of distrusted:
 * {@link normalizeEntryOrigins} rewrites BOTH of them to `{origin}` before
 * anything is compared, and the two hosts are stated as a NOTE in the report
 * header rather than as a verdict.
 *
 * That note is not a claim that a cross-origin pair compares clean. It does not,
 * on this storefront, and the report says so concretely on two counts. The
 * robots meta and the robots.txt verdict are gated on the REQUEST host
 * (`isIndexableCurrentHost`, `app/robots.ts`) and fail closed off the store's
 * configured domain, so a preview host reports `noindex` on every URL — which is
 * true, is PR #323 working as designed, and is left in the report to be read as
 * a real finding. And every origin-bearing field that MATCHES across two
 * different hosts is reported as `undetermined` rather than as a match, because
 * the token no longer names the same origin on both sides.
 *
 * These rows are the FIRST group in {@link DIFF_GROUPS} and count as signal
 * differences, so a mismatched pair cannot be read as a clean run and cannot
 * pass `--fail-on signal`.
 */
function comparabilityRows(before: CaptureRun, after: CaptureRun): DiffRow[] {
  const b = before.meta;
  const a = after.meta;
  const rows: DiffRow[] = [];
  const check = (
    field: string,
    bValue: string,
    aValue: string,
    detail: string,
  ): void => {
    if (bValue !== aValue)
      rows.push(row("comparability", "*", field, bValue, aValue, detail));
  };

  check(
    "harness version",
    b.harnessVersion,
    a.harnessVersion,
    "the two captures were taken by different builds of this harness; a procedure change can move a value without the storefront moving",
  );
  check(
    "page clock pinned",
    b.clockPinned ? "yes (--freeze-clock)" : "no",
    a.clockPinned ? "yes (--freeze-clock)" : "no",
    "one run pinned the page clock and the other did not, so any date or countdown differs for that reason alone",
  );
  check(
    "viewports",
    viewportsText(b.viewports),
    viewportsText(a.viewports),
    "the screenshots were taken at different sizes",
  );
  check(
    "normalise rules",
    rulesText(b.normalize),
    rulesText(a.normalize),
    "the two runs rewrote captured values differently before comparison",
  );
  check(
    "screenshot masks",
    masksText(b.masks),
    masksText(a.masks),
    "the two runs blanked different regions, so the pixel comparison covers different areas",
  );
  check(
    "blocked hosts",
    [...b.blockedHosts].sort().join(", "),
    [...a.blockedHosts].sort().join(", "),
    "the two runs refused different hosts, so the pages did not load the same resources",
  );
  return rows;
}

function viewportsText(v: CaptureRunMeta["viewports"]): string {
  return `desktop ${v.desktop.width}x${v.desktop.height}, mobile ${v.mobile.width}x${v.mobile.height}`;
}

function rulesText(rules: CaptureRunMeta["normalize"]): string {
  if (rules.length === 0) return "(none)";
  return rules
    .map((r) => `${r.field}:/${r.pattern}/${r.flags}->${r.replace}`)
    .sort()
    .join(" | ");
}

function masksText(masks: CaptureRunMeta["masks"]): string {
  if (masks.length === 0) return "(none)";
  return masks
    .map(
      (m) =>
        `${m.selector}@${m.paths.length === 0 ? "*" : [...m.paths].sort().join(",")}`,
    )
    .sort()
    .join(" | ");
}

/**
 * The two runs' base origins, for cross-origin normalisation at compare time.
 *
 * Empty when both runs swept the same origin, which is the recommended
 * workflow and the case where nothing needs doing.
 */
export function pairOrigins(before: CaptureRun, after: CaptureRun): string[] {
  const b = before.meta.baseUrl;
  const a = after.meta.baseUrl;
  if (b === a) return [];
  return [b, a].filter((o) => o !== "");
}

/**
 * Rewrite BOTH runs' origins to `{origin}` in every field that can carry one.
 *
 * Applied to whole entries rather than at each comparison site on purpose: a
 * field added later is normalised by construction instead of by remembering.
 * Capture time cannot do this job alone — it only knows the origin it was
 * pointed at, and this storefront bakes the runtime STORE DOMAIN into the
 * canonical, `og:url` and JSON-LD (`storefrontUrl`, `resolveJsonLdSiteUrl`),
 * so on a preview host that origin is not the run's own and survives verbatim.
 *
 * WHAT THIS DOES NOT TOUCH, deliberately: the robots meta and the robots.txt
 * verdict. Those are not URLs carrying an origin — they are the storefront's
 * host-gated indexing DECISION (`isIndexableCurrentHost`, `app/robots.ts`,
 * which fail closed for any host that is not the store's configured domain).
 * A preview deployment genuinely IS noindex, so that difference is true and
 * must reach the report. Normalising it away to make a cross-origin report
 * look tidy would be the false green this whole instrument exists to prevent.
 *
 * RECONCILING IS NOT VERIFYING, and the difference is the reason the
 * `undetermined` group exists. Once both origins collapse onto one token, an
 * origin SWAP — a canonical that regressed to naming the sweep host instead of
 * the store's configured domain — is indistinguishable from agreement, and it
 * cannot be recovered here because capture already erased which origin the
 * token replaced. So every field this touches that then MATCHES with the token
 * present is reported as undetermined rather than as a match; see
 * {@link undeterminedFor}.
 */
function normalizeEntryOrigins(
  entry: CaptureEntry,
  origins: readonly string[],
): CaptureEntry {
  if (origins.length === 0) return entry;
  const n = (value: string): string => normalizeOrigins(value, origins);
  const maybe = (value: string | null): string | null =>
    value === null ? null : n(value);
  return {
    ...entry,
    http: {
      ...entry.http,
      finalUrl: n(entry.http.finalUrl),
      chain: entry.http.chain.map((hop) => ({
        ...hop,
        url: n(hop.url),
        location: maybe(hop.location),
      })),
    },
    browser:
      entry.browser === null
        ? null
        : { ...entry.browser, finalUrl: n(entry.browser.finalUrl) },
    indexing: {
      ...entry.indexing,
      canonical: maybe(entry.indexing.canonical),
      ogUrl: maybe(entry.indexing.ogUrl),
    },
    jsonld: entry.jsonld.map((node) => ({
      ...node,
      url: maybe(node.url),
      id: maybe(node.id),
    })),
    links: entry.links.map(n),
    blockedRequests: entry.blockedRequests.map((r) => ({
      ...r,
      url: n(r.url),
    })),
  };
}

/** Compare the signal half of two capture runs. */
export function diffSignals(before: CaptureRun, after: CaptureRun): DiffResult {
  const origins = pairOrigins(before, after);
  const crossOrigin = origins.length > 0;
  const beforeMap = new Map(
    before.entries.map((e) => [e.key, normalizeEntryOrigins(e, origins)]),
  );
  const afterMap = new Map(
    after.entries.map((e) => [e.key, normalizeEntryOrigins(e, origins)]),
  );
  const rows: DiffRow[] = [...comparabilityRows(before, after)];

  const onlyInBefore = [...beforeMap.keys()]
    .filter((k) => !afterMap.has(k))
    .sort();
  const onlyInAfter = [...afterMap.keys()]
    .filter((k) => !beforeMap.has(k))
    .sort();
  for (const key of onlyInBefore) {
    rows.push(
      row(
        "capture",
        key,
        "captured",
        "present",
        null,
        "URL captured before, not after",
      ),
    );
  }
  for (const key of onlyInAfter) {
    rows.push(
      row(
        "capture",
        key,
        "captured",
        null,
        "present",
        "URL captured after, not before",
      ),
    );
  }

  const failedInBefore = before.entries
    .filter((e) => e.errors.length > 0)
    .map((e) => e.key)
    .sort();
  const failedInAfter = after.entries
    .filter((e) => e.errors.length > 0)
    .map((e) => e.key)
    .sort();
  const failedInBoth: string[] = [];

  const shared = [...beforeMap.keys()].filter((k) => afterMap.has(k)).sort();
  for (const key of shared) {
    const b = beforeMap.get(key)!;
    const a = afterMap.get(key)!;

    if (b.errors.length > 0 || a.errors.length > 0) {
      rows.push(
        ...listRows(
          "capture",
          key,
          "capture error",
          b.errors,
          a.errors,
          LIST_ROW_CAP,
        ),
      );
    }
    // A URL that failed in BOTH runs, whether or not it failed the same way.
    // The set difference above says nothing when the two error lists match, and
    // "the two runs agree" is precisely the wrong reading of a URL neither run
    // managed to look at. This row makes it impossible for the report to count
    // that URL as a clean comparison, and it sits in the signal tier so the
    // exit code carries it too.
    if (b.errors.length > 0 && a.errors.length > 0) {
      failedInBoth.push(key);
      rows.push(
        row(
          "capture",
          key,
          "capture failed in BOTH runs",
          b.errors.join(" | "),
          a.errors.join(" | "),
          "nothing about this URL was verified; a matching failure on both sides is not a match",
        ),
      );
    }
    if (b.mode !== a.mode) {
      rows.push(row("capture", key, "capture mode", b.mode, a.mode));
    }

    // --- redirect -----------------------------------------------------------
    if (b.http.finalStatus !== a.http.finalStatus) {
      rows.push(
        row(
          "redirect",
          key,
          "final HTTP status",
          b.http.finalStatus,
          a.http.finalStatus,
        ),
      );
    }
    if (b.http.hopCount !== a.http.hopCount) {
      rows.push(
        row(
          "redirect",
          key,
          "redirect hop count",
          b.http.hopCount,
          a.http.hopCount,
        ),
      );
    }
    const bChain = chainText(b);
    const aChain = chainText(a);
    if (bChain !== aChain) {
      rows.push(row("redirect", key, "redirect chain", bChain, aChain));
    } else {
      rows.push(
        ...undeterminedFor(crossOrigin, key, "redirect chain", bChain, aChain),
      );
    }
    if (b.http.finalUrl !== a.http.finalUrl) {
      rows.push(
        row("redirect", key, "final URL", b.http.finalUrl, a.http.finalUrl),
      );
    } else {
      rows.push(
        ...undeterminedFor(
          crossOrigin,
          key,
          "final URL",
          b.http.finalUrl,
          a.http.finalUrl,
        ),
      );
    }
    const bClient = b.browser?.clientSideRedirect ?? null;
    const aClient = a.browser?.clientSideRedirect ?? null;
    if (bClient !== aClient) {
      rows.push(
        row(
          "redirect",
          key,
          "client-side redirect",
          bClient,
          aClient,
          "the browser ended somewhere the HTTP chain did not",
        ),
      );
    }
    const bBrowserUrl = b.browser?.finalUrl ?? null;
    const aBrowserUrl = a.browser?.finalUrl ?? null;
    if (bBrowserUrl !== aBrowserUrl) {
      rows.push(
        row("redirect", key, "browser final URL", bBrowserUrl, aBrowserUrl),
      );
    } else {
      rows.push(
        ...undeterminedFor(
          crossOrigin,
          key,
          "browser final URL",
          bBrowserUrl,
          aBrowserUrl,
        ),
      );
    }

    // --- indexing -----------------------------------------------------------
    const bTitle = b.browser?.title ?? null;
    const aTitle = a.browser?.title ?? null;
    if (bTitle !== aTitle) {
      rows.push(row("indexing", key, "document title", bTitle, aTitle));
    }
    if (b.indexing.canonical !== a.indexing.canonical) {
      rows.push(
        row(
          "indexing",
          key,
          "link rel=canonical",
          b.indexing.canonical,
          a.indexing.canonical,
        ),
      );
    } else {
      rows.push(
        ...undeterminedFor(
          crossOrigin,
          key,
          "link rel=canonical",
          b.indexing.canonical,
          a.indexing.canonical,
        ),
      );
    }
    if (b.indexing.ogUrl !== a.indexing.ogUrl) {
      rows.push(
        row("indexing", key, "meta og:url", b.indexing.ogUrl, a.indexing.ogUrl),
      );
    } else {
      rows.push(
        ...undeterminedFor(
          crossOrigin,
          key,
          "meta og:url",
          b.indexing.ogUrl,
          a.indexing.ogUrl,
        ),
      );
    }
    if (b.indexing.robotsMeta !== a.indexing.robotsMeta) {
      rows.push(
        row(
          "indexing",
          key,
          "meta name=robots",
          b.indexing.robotsMeta,
          a.indexing.robotsMeta,
        ),
      );
    }
    rows.push(...indexingByPathRows(key, "requested path", b, a, "requested"));
    // The FINAL-path verdict is compared only when the URL actually redirected
    // in one of the runs. When it did not, the two paths are the same
    // measurement and reporting both would double every row. When it did — the
    // flat product URL, whose "after" is a 308 — the requested-path rows above
    // are the ones that carry the port's sitemap and robots delta, and these
    // describe the destination.
    if (
      b.indexing.final.path !== b.indexing.requested.path ||
      a.indexing.final.path !== a.indexing.requested.path
    ) {
      rows.push(...indexingByPathRows(key, "final path", b, a, "final"));
    }

    // --- structured data ----------------------------------------------------
    const bJsonLd = b.jsonld.map(jsonLdKey);
    const aJsonLd = a.jsonld.map(jsonLdKey);
    rows.push(
      ...listRows(
        "structured-data",
        key,
        "JSON-LD node",
        bJsonLd,
        aJsonLd,
        LIST_ROW_CAP,
      ),
    );
    rows.push(
      ...undeterminedValueRows(
        crossOrigin,
        key,
        "JSON-LD node",
        sharedOriginBearing(bJsonLd, aJsonLd),
      ),
    );

    // --- links --------------------------------------------------------------
    // The two runs do not spell an absolute internal href the same way, and
    // origin normalisation alone does not fix it: `normalizeHref` reduced it to
    // a bare path in the run whose own origin it named, so the counterpart
    // arrives here as `{origin}/shop` against a plain `/shop`. Reduce before
    // comparing — and check for the token BEFORE reducing, because a match that
    // needed the reduction is exactly the one this pair cannot determine.
    const bHrefs = b.links.map(reduceOriginHref);
    const aHrefs = a.links.map(reduceOriginHref);
    rows.push(...listRows("links", key, "href", bHrefs, aHrefs, LIST_ROW_CAP));
    const sharedHrefs = new Set(aHrefs);
    rows.push(
      ...undeterminedValueRows(
        crossOrigin,
        key,
        "href",
        [...b.links, ...a.links]
          .filter((v) => v.includes(ORIGIN_TOKEN))
          .map(reduceOriginHref)
          .filter((h) => sharedHrefs.has(h) && bHrefs.includes(h)),
      ),
    );

    // --- no-JS --------------------------------------------------------------
    if (b.nojs !== null && a.nojs !== null) {
      if (b.nojs.rawTextLength !== a.nojs.rawTextLength) {
        rows.push(
          row(
            "nojs",
            key,
            "prerendered text length",
            b.nojs.rawTextLength,
            a.nojs.rawTextLength,
          ),
        );
      }
      if (b.nojs.rawLinkCount !== a.nojs.rawLinkCount) {
        rows.push(
          row(
            "nojs",
            key,
            "prerendered link count",
            b.nojs.rawLinkCount,
            a.nojs.rawLinkCount,
          ),
        );
      }
      if (b.nojs.hasNoscript !== a.nojs.hasNoscript) {
        rows.push(
          row(
            "nojs",
            key,
            "has <noscript> content",
            b.nojs.hasNoscript,
            a.nojs.hasNoscript,
          ),
        );
      }
      const bInk = b.nojs.screenshot?.inkRatio ?? null;
      const aInk = a.nojs.screenshot?.inkRatio ?? null;
      const inkMoved =
        bInk === null || aInk === null
          ? bInk !== aInk
          : Math.abs(bInk - aInk) > NOJS_INK_EPSILON;
      if (inkMoved) {
        rows.push(
          row(
            "nojs",
            key,
            "ink ratio (JS off)",
            bInk,
            aInk,
            `fraction of pixels differing from the page background; near zero means a blank shell (moved by more than ${NOJS_INK_EPSILON})`,
          ),
        );
      }
    } else if ((b.nojs === null) !== (a.nojs === null)) {
      rows.push(
        row(
          "nojs",
          key,
          "no-JavaScript pass",
          b.nojs === null ? "not captured" : "captured",
          a.nojs === null ? "not captured" : "captured",
        ),
      );
    }

    // --- cache --------------------------------------------------------------
    const headerKeys = Object.keys(
      b.http.headers,
    ) as (keyof typeof b.http.headers)[];
    for (const h of headerKeys) {
      if (b.http.headers[h] !== a.http.headers[h]) {
        rows.push(
          row("cache", key, String(h), b.http.headers[h], a.http.headers[h]),
        );
      }
    }

    // --- safety -------------------------------------------------------------
    rows.push(
      ...listRows(
        "capture",
        key,
        "blocked non-GET request",
        b.blockedRequests.map((r) => `${r.method} ${r.url}`),
        a.blockedRequests.map((r) => `${r.method} ${r.url}`),
        LIST_ROW_CAP,
      ),
    );
  }

  return {
    rows,
    comparability: rows.filter((r) => r.group === "comparability"),
    comparedKeys: shared.length,
    onlyInBefore,
    onlyInAfter,
    failedInBefore,
    failedInAfter,
    failedInBoth: failedInBoth.sort(),
  };
}

/** Sort rows into report order: group severity, then path, then field. */
export function sortRows(rows: readonly DiffRow[]): DiffRow[] {
  const order = new Map(DIFF_GROUPS.map((g, i) => [g, i]));
  return [...rows].sort(
    (a, b) =>
      (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
      a.key.localeCompare(b.key) ||
      a.field.localeCompare(b.field),
  );
}

/**
 * Rows that are not merely pixels — what a reader must look at first.
 *
 * `undetermined` is excluded on purpose: those rows are not differences and
 * counting them among the signal differences would inflate a figure a reader
 * uses to decide whether anything MOVED. They are counted and printed on their
 * own line, and they carry the exit code independently (see `compare.ts`).
 */
export function signalRows(rows: readonly DiffRow[]): DiffRow[] {
  return rows.filter(
    (r) =>
      r.group !== "pixel" && r.group !== "cache" && r.group !== "undetermined",
  );
}

/** Rows naming a field this pair could not determine either way. */
export function undeterminedRows(rows: readonly DiffRow[]): DiffRow[] {
  return rows.filter((r) => r.group === "undetermined");
}

/** What `compare.ts --fail-on` was set to. */
export type FailOn = "any" | "signal" | "none";

/**
 * The exit-code rule, as a function of the rows rather than of the CLI.
 *
 * It lives here, and not inline in `compare.ts`, because two of its three
 * clauses are deliberate exceptions that a reader will otherwise take for
 * oversights — and because a rule buried in a `process.exit` call is a rule no
 * test can reach:
 *
 *  - CACHE ROWS DO NOT COUNT under `any`. The cache group is recorded, not
 *    asserted: `x-vercel-cache` flips between HIT and MISS on its own schedule,
 *    so two sweeps of a real Vercel storefront disagree on it almost always. An
 *    exit code that is red on every healthy run stops carrying information. The
 *    rows are still printed in full; they simply stop deciding the verdict.
 *  - UNDETERMINED ROWS DO COUNT, under `any` AND under `signal`, even though
 *    they are not differences and are not in the signal count. A comparison
 *    that could not verify a field has not passed.
 */
export function exitCodeFor(rows: readonly DiffRow[], failOn: FailOn): 0 | 1 {
  if (failOn === "none") return 0;
  if (failOn === "signal") {
    return signalRows(rows).length > 0 || undeterminedRows(rows).length > 0
      ? 1
      : 0;
  }
  return rows.some((r) => r.group !== "cache") ? 1 : 0;
}
