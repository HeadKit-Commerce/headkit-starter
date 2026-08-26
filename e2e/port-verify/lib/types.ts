/**
 * Shared record shapes for the port-verification capture/compare harness.
 *
 * The capture record is the deliverable this harness exists to produce, so its
 * shape is declared once, here. A field that is neither a stable property of the
 * page nor deliberately reduced to a stable form is a self-diff failure waiting
 * to happen, and three mechanisms — not a list — are what keep that true:
 *
 *  - the plan's {@link NormalizeRule}s, each carrying a `why` the report prints,
 *    rewrite genuinely volatile strings (a session id, a rendered counter)
 *    before they are compared, and reach the raw-HTML metrics no mask can;
 *  - the plan's {@link MaskRule}s blank volatile REGIONS of a screenshot, and
 *    the report prints every one of them as the blind spot it is;
 *  - a field that cannot be stabilised is recorded as presence rather than
 *    value — {@link CapturedHeaders."age-present"} is the whole of that
 *    category, because `age` counts seconds and is volatile by definition.
 *
 * Anything added here has to fall into one of those three or be stable on its
 * own. The acceptance gate that enforces it is GATE 1 in `gate.ts`: two captures
 * of an unchanged target must diff to nothing.
 */

/** Which capture pass a target gets. */
export type CaptureMode = "full" | "signals";

/** One URL to capture, resolved from the plan. */
export interface CaptureTarget {
  /** Site-relative path, always starting `/`. This is the pairing key. */
  readonly path: string;
  /** Inventory `kind` (`product`/`category`/`listing`/`editorial`/`functional`). */
  readonly kind: string;
  /**
   * `signals` skips every screenshot and the no-JS pass. Used for URLs whose
   * "after" is a redirect rather than a page — the flat product URL, whose
   * status goes 200 -> 308 across the port, has no page to pair pixels with.
   */
  readonly mode: CaptureMode;
}

/** A plan entry deliberately not captured, and why. */
export interface SkippedTarget {
  readonly path: string;
  readonly reason: string;
}

/** A screenshot region blanked before comparison. Every one is a blind spot. */
export interface MaskRule {
  /** CSS selector passed to Playwright's screenshot `mask`. */
  readonly selector: string;
  /** Why this region is masked. Rendered into the report, not just the source. */
  readonly why: string;
  /** Path globs this applies to. Empty/absent = every captured path. */
  readonly paths: readonly string[];
}

/** Which captured string fields a normalisation rule rewrites. */
export type NormalizeField =
  | "canonical"
  | "og_url"
  | "links"
  | "jsonld"
  | "robots_meta"
  | "all";

/** A regex rewrite applied to captured signal strings. Also a blind spot. */
export interface NormalizeRule {
  readonly field: NormalizeField;
  readonly pattern: string;
  readonly flags: string;
  readonly replace: string;
  readonly why: string;
  /**
   * Path globs this rule applies to. Empty/absent = every captured URL, which
   * is the historical behaviour and stays the default.
   *
   * Present for the same reason {@link MaskRule.paths} is: a rule wide enough
   * to absorb one page's volatile value is usually far too wide for the rest of
   * the store. A rule that rewrites `/products/<slug>` so a product page's
   * related-products carousel stops reporting its per-render pick would, run
   * store-wide, also collapse every product grid on `/shop`, `/search` and each
   * collection to a single token — and a port that dropped half the catalogue
   * off those pages would then compare clean. Scoping a normalisation NARROWS
   * the blind spot, which is the safe direction; there is deliberately no way
   * to widen a mask this way (see {@link MaskRule.paths} and `unionMasks`).
   */
  readonly paths: readonly string[];
}

/**
 * One hop of an HTTP redirect chain.
 *
 * `url` and `location` are ABSOLUTE and origin-normalised: the target's own
 * origin becomes the literal `{origin}` token and a third-party origin is left
 * intact, exactly as a canonical is treated. Dropping the host would make a
 * `308` to `https://other-host/shop/x` byte-identical to one to `/shop/x`, and
 * a redirect that starts naming another host is a regression, not noise. The
 * query string is preserved for the same reason — a hop that gains
 * `?utm_source=…` is a change.
 */
export interface RedirectHop {
  readonly url: string;
  readonly status: number;
  /** `Location` resolved against the hop and origin-normalised, or null. */
  readonly location: string | null;
}

/** Response headers kept per entry. Cache headers are recorded, not asserted. */
export interface CapturedHeaders {
  readonly "content-type": string | null;
  readonly "cache-control": string | null;
  readonly "x-nextjs-cache": string | null;
  readonly "x-vercel-cache": string | null;
  readonly "x-nextjs-prerender": string | null;
  readonly "x-matched-path": string | null;
  /** Presence only — the value counts seconds and is volatile by definition. */
  readonly "age-present": boolean;
}

/** One JSON-LD node reduced to the fields a port can regress. */
export interface JsonLdNode {
  readonly type: string;
  readonly url: string | null;
  readonly id: string | null;
}

/** robots.txt verdict for one path. */
export interface RobotsVerdict {
  readonly allowed: boolean;
  /** The winning directive line, e.g. `Disallow: /`, or null when none matched. */
  readonly rule: string | null;
  /** Which user-agent group decided it. */
  readonly userAgent: string;
}

/**
 * robots.txt verdict and sitemap membership, and the path they were asked for.
 *
 * BOTH PATHS ARE RECORDED, because they answer different questions and the
 * port changes the answer to one of them. The flat product URL returns 200
 * before the port and 308 after it: keyed on the FINAL path alone, the "before"
 * run measures `/products/x` and the "after" run measures `/shop/…/x`, so a
 * port that drops `/products/x` from the sitemap or adds `Disallow: /products/`
 * reads as unchanged. Keyed on the REQUESTED path alone, the destination's own
 * verdict is never seen. So both are captured, both are named in the report,
 * and the capture-failure fallback fills both from the requested path — the one
 * path it still knows.
 */
export interface IndexingByPath {
  /** The path this verdict and membership were computed for. */
  readonly path: string;
  readonly robotsTxt: RobotsVerdict;
  readonly inSitemap: boolean;
}

/** Metrics of one screenshot that survive re-capture. */
export interface ScreenshotRecord {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /**
   * Fraction of pixels differing from the page's dominant background colour.
   * Near-zero on an empty prerendered shell — the metric that makes a
   * root-layout Suspense regression visible without reading pixels by eye.
   */
  readonly inkRatio: number;
  /**
   * Whether two consecutive frames of this screenshot came out pixel-identical
   * before it was kept — the capture-side stability gate's verdict, not a
   * property of the storefront.
   *
   * `false` means the gate exhausted its retries and kept a moving frame, so a
   * pixel difference on this screenshot may be the capture rather than the
   * page. The comparison prints that as a row of its own.
   *
   * OPTIONAL, AND DELIBERATELY WITHOUT A SCHEMA BUMP, for the same reason
   * `NormalizeRule.paths` was (see `load.ts`): a capture written before the
   * gate existed is still a valid capture and must still compare. `undefined`
   * therefore means UNKNOWN — not stable — and every reader must test for
   * `=== false` rather than falsiness, or every pre-gate screenshot reads as a
   * give-up that never happened.
   */
  readonly frameStable?: boolean;
}

/** The no-JavaScript pass. */
export interface NoJsRecord {
  /** Text length of the raw prerendered HTML, scripts and styles stripped. */
  readonly rawTextLength: number;
  /** `<a href>` count in the raw prerendered HTML. */
  readonly rawLinkCount: number;
  /** Whether the shell carries any `<noscript>` content. */
  readonly hasNoscript: boolean;
  readonly screenshot: ScreenshotRecord | null;
}

/** A non-GET request the safety interceptor refused. */
export interface BlockedRequest {
  readonly method: string;
  readonly url: string;
}

/** Everything captured for one URL. */
export interface CaptureEntry {
  readonly key: string;
  readonly kind: string;
  readonly mode: CaptureMode;
  readonly http: {
    readonly chain: readonly RedirectHop[];
    readonly finalUrl: string;
    readonly finalStatus: number;
    readonly hopCount: number;
    readonly headers: CapturedHeaders;
  };
  readonly browser: {
    readonly finalUrl: string;
    /**
     * True when the browser ended somewhere the HTTP chain did not — the
     * 200-with-a-client-side-redirect case, which must never read the same as
     * a 308.
     */
    readonly clientSideRedirect: boolean;
    readonly title: string;
  } | null;
  readonly indexing: {
    readonly canonical: string | null;
    readonly ogUrl: string | null;
    readonly robotsMeta: string | null;
    /** Keyed on the path the plan ASKED for. */
    readonly requested: IndexingByPath;
    /** Keyed on where the redirect chain ENDED. Equal to `requested` when it did not redirect. */
    readonly final: IndexingByPath;
  };
  readonly jsonld: readonly JsonLdNode[];
  readonly links: readonly string[];
  readonly nojs: NoJsRecord | null;
  readonly screens: {
    readonly desktop: ScreenshotRecord | null;
    readonly mobile: ScreenshotRecord | null;
  };
  readonly blockedRequests: readonly BlockedRequest[];
  readonly errors: readonly string[];
}

/**
 * Run-level metadata.
 *
 * All of it is reported. The subset that governs whether two runs are
 * comparable at all — `harnessVersion`, `clockPinned`, `viewports`,
 * `normalize`, `masks`, `blockedHosts` — is ALSO compared, and a mismatch is
 * the first group in the report rather than an invisible caveat. The rest
 * (labels, timestamps, counts) is descriptive and is only rendered.
 *
 * `baseUrl` is NOT in that subset. A cross-origin pair is supported: the
 * comparison reconciles both runs' origins to `{origin}` before comparing, and
 * the report states the two hosts as a note — together with the one thing that
 * genuinely does differ by construction across hosts, the request-host-gated
 * robots meta and robots.txt verdict, which are reported as the real findings
 * they are. See `diffSignals` in `lib/diff.ts`.
 */
export interface CaptureRunMeta {
  readonly schemaVersion: string;
  readonly harnessVersion: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly planName: string;
  readonly planPath: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly targetCount: number;
  readonly skipped: readonly SkippedTarget[];
  readonly masks: readonly MaskRule[];
  readonly normalize: readonly NormalizeRule[];
  readonly blockedHosts: readonly string[];
  readonly viewports: { readonly desktop: Viewport; readonly mobile: Viewport };
  readonly sitemapEntryCount: number;
  readonly robotsTxtPresent: boolean;
  /** Whether the run pinned the page clock (`--freeze-clock`). */
  readonly clockPinned: boolean;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** A whole capture directory, loaded. */
export interface CaptureRun {
  readonly meta: CaptureRunMeta;
  readonly entries: readonly CaptureEntry[];
  /** Absolute path of the directory this run was loaded from. */
  readonly dir: string;
}

/** Capture schema version. Bump on any breaking record-shape change. */
export const CAPTURE_SCHEMA_VERSION = "1.1.0";
