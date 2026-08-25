/**
 * port-verify capture — record what every URL in a store's inventory IS.
 *
 *   bun run e2e/port-verify/capture.ts \
 *     --base-url https://example.invalid \
 *     --plan e2e/port-verify/plans/<store>.json \
 *     --out .port-verify/before \
 *     --label before
 *
 * A SCREENSHOT DIFF WOULD NOT HAVE CAUGHT THE CHANGES THIS EXISTS FOR. The
 * starter work about to be ported makes the nested URL canonical and 308s the
 * flat one, gates the robots meta on the host rather than the deploy
 * environment, and rewrites Product and Breadcrumb JSON-LD, internal hrefs and
 * the sitemap to match. Every one of those renders pixel-identical. A
 * screenshot-only comparison reports "no change" and the port ships an indexing
 * regression under a green light — worse than no check at all, because it is
 * believed. So this records what a page IS: the status and full redirect chain,
 * the canonical, the robots meta AND the robots.txt verdict for the path, every
 * JSON-LD @type/url/@id, sitemap membership, every rendered href, the cache and
 * prerender headers, and — for every page — one capture with JavaScript
 * disabled, because a root-layout Suspense boundary once produced a prerendered
 * shell that looked perfect with JS on and was blank with it off.
 *
 * READ-ONLY, GET-ONLY, AND STRUCTURALLY UNABLE TO PLACE AN ORDER. See
 * `lib/safety.ts` — that is the contract, not this comment.
 *
 * STORE-AGNOSTIC. No hostname and no fixture path is defaulted or hard-coded.
 * Both are required arguments, for the same reason `store-parity.spec.ts`
 * defaults neither: a default would silently decide which store a run is about.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { chromium, request as playwrightRequest } from "@playwright/test";
import type {
  APIRequestContext,
  APIResponse,
  Browser,
  Page,
} from "@playwright/test";
import { numberOption, parseArgv } from "./lib/args";
import { prepareOutputDir } from "./lib/outdir";
import type { OutputDirOutcome } from "./lib/outdir";
import { slugFor } from "./lib/slug";
import { loadPlan, masksForPath } from "./lib/plan";
import type { CapturePlan } from "./lib/plan";
import { installGetOnlyGuard } from "./lib/safety";
import { extractJsonLd } from "./lib/jsonld";
import { parseRobotsTxt, robotsVerdict, ROBOTS_ABSENT } from "./lib/robots-txt";
import type { RobotsTxt } from "./lib/robots-txt";
import { isSitemapIndex, parseSitemapLocs } from "./lib/sitemap";
import {
  extractAnchorHrefs,
  extractCanonicals,
  extractRobotsMetas,
  hasNoscriptContent,
  htmlToText,
  joinTagValues,
} from "./lib/html";
import {
  applyRules,
  normalizeHref,
  normalizeOrigin,
  normalizeValue,
} from "./lib/normalize";
import { decodePng, inkRatio } from "./lib/png";
import { CAPTURE_SCHEMA_VERSION } from "./lib/types";
import type {
  BlockedRequest,
  CaptureEntry,
  CaptureRunMeta,
  CaptureTarget,
  CapturedHeaders,
  IndexingByPath,
  JsonLdNode,
  RedirectHop,
  ScreenshotRecord,
  Viewport,
} from "./lib/types";

/**
 * Bumped when the capture procedure changes in a way that invalidates pairs.
 *
 * READ BY `compare.ts`, not merely recorded: a mismatch between the two runs is
 * a comparability row at the top of the report and counts as a signal
 * difference. Bump this for any change to how a page is reached, settled,
 * masked or photographed — the kind that moves a captured value without the
 * storefront moving — even when the record shape is untouched, because
 * `loadRun`'s schema gate cannot see those.
 */
export const HARNESS_VERSION = "1.1.0";

/** Fixed viewports. Never taken from a device preset — presets change between
 * Playwright releases, which would silently repaint every screenshot. */
export const DESKTOP: Viewport = { width: 1280, height: 900 };
export const MOBILE: Viewport = { width: 390, height: 844 };

/**
 * Optional wall-clock pinning, behind `--freeze-clock`.
 *
 * OFF BY DEFAULT, and that is a deliberate choice rather than an omission.
 * Overriding `Date` in a real storefront is not free — application code that
 * loops until a deadline needs the clock to move — so this advances by exactly
 * one millisecond per read rather than standing still: every such loop still
 * terminates, and every rendered date is identical between two runs. Turn it on
 * for a target that renders a date or a countdown; leave it off otherwise.
 */
const FREEZE_DATE = `(() => {
  const FIXED = 1767225600000;
  let tick = 0;
  const RealDate = Date;
  const now = () => FIXED + tick++;
  function FrozenDate(...args) {
    if (!(this instanceof FrozenDate)) return new RealDate(now()).toString();
    return args.length === 0 ? new RealDate(now()) : new RealDate(...args);
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = now;
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  window.Date = FrozenDate;
})();`;

/** Fixed UA: the default carries a Chromium build number that moves on upgrade. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/HeadKitPortVerify Safari/537.36";

/** Kills motion, carets and smooth scrolling before any screenshot is taken. */
const FREEZE_CSS = `
*, *::before, *::after {
  animation-delay: -1ms !important;
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html { scroll-behavior: auto !important; }
`;

/** Seeds Math.random so a randomised carousel or placeholder is reproducible. */
const SEED_RANDOM = `(() => {
  let s = 0x2f6e2b1;
  Math.random = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
    return ((s >>> 0) % 1000000) / 1000000;
  };
})();`;

/**
 * Hard deadline for one browser pass.
 *
 * Every browser call in this file is fenced by it. A capture that wedges is
 * worse than one that fails: it produces no record, no error and no report, and
 * the operator learns nothing. A pass that blows the deadline is recorded as a
 * capture error on the entry, which the comparison surfaces as a difference.
 */
const PASS_TIMEOUT_MS = 90_000;

/** Reject with a named reason rather than hanging forever. */
async function withTimeout<T>(
  work: Promise<T>,
  label: string,
  ms = PASS_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Masking for the no-JavaScript pass, delivered as a stylesheet.
 *
 * Playwright's screenshot `mask` option resolves its locators by evaluating in
 * the page, which a context with scripting disabled cannot do. Masking has to
 * survive that pass — the volatile regions are volatile with or without
 * scripting — so the no-JS context injects this into the document instead. The
 * paint colour matches Playwright's own mask colour so the two passes' masked
 * regions look alike in the report.
 */
function maskStylesheet(selectors: readonly string[]): string {
  if (selectors.length === 0) return "";
  const list = selectors.join(", ");
  return `<style id="port-verify-mask">${list} { background: #ff00ff !important; color: #ff00ff !important; }
${selectors.map((s) => `${s} *`).join(", ")} { visibility: hidden !important; }</style>`;
}

const MAX_REDIRECT_HOPS = 10;
const MAX_SITEMAP_CHILDREN = 25;

interface Args {
  baseUrl: string;
  plan: string;
  out: string;
  label: string;
  concurrency: number;
  minIntervalMs: number;
  timeoutMs: number;
  freezeClock: boolean;
  overwrite: boolean;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const TOOL = "port-verify capture";

/** Every option this CLI reads. An undeclared flag is an error, not a no-op. */
const ARG_SPEC = {
  value: [
    "base-url",
    "plan",
    "out",
    "label",
    "concurrency",
    "min-interval-ms",
    "timeout-ms",
  ],
  boolean: ["freeze-clock", "overwrite"],
} as const;

function parseArgs(argv: readonly string[]): Args {
  let map: ReadonlyMap<string, string>;
  let flags: ReadonlySet<string>;
  try {
    const parsed = parseArgv(argv, ARG_SPEC, TOOL);
    map = parsed.values;
    flags = parsed.flags;
  } catch (err) {
    fail((err as Error).message);
  }
  const baseUrl = (map.get("base-url") ?? "").replace(/\/+$/, "");
  const plan = map.get("plan") ?? "";
  const outDir = map.get("out") ?? "";
  if (baseUrl === "" || plan === "" || outDir === "") {
    fail(
      "port-verify capture: --base-url, --plan and --out are all required and none is defaulted.\n" +
        "  A default base URL would sweep whichever host was configured last; a default plan would\n" +
        "  compare one store's URLs against another store's host.\n" +
        "  usage: bun run e2e/port-verify/capture.ts --base-url <origin> --plan <file.json> --out <dir> [--label before] [--overwrite]",
    );
  }
  try {
    void new URL(baseUrl);
  } catch {
    fail(
      `port-verify capture: --base-url ${baseUrl} is not a valid absolute URL`,
    );
  }
  try {
    return {
      baseUrl,
      plan,
      out: outDir,
      label: map.get("label") ?? "capture",
      concurrency: numberOption(map, "concurrency", 2, 1, 8, TOOL),
      minIntervalMs: numberOption(
        map,
        "min-interval-ms",
        250,
        0,
        600_000,
        TOOL,
      ),
      timeoutMs: numberOption(map, "timeout-ms", 45_000, 1, 600_000, TOOL),
      freezeClock: flags.has("freeze-clock"),
      overwrite: flags.has("overwrite"),
    };
  } catch (err) {
    fail((err as Error).message);
  }
}

function headerOf(res: APIResponse, name: string): string | null {
  const found = res.headersArray().find((h) => h.name.toLowerCase() === name);
  return found?.value ?? null;
}

function capturedHeaders(res: APIResponse): CapturedHeaders {
  return {
    "content-type": headerOf(res, "content-type"),
    "cache-control": headerOf(res, "cache-control"),
    "x-nextjs-cache": headerOf(res, "x-nextjs-cache"),
    "x-vercel-cache": headerOf(res, "x-vercel-cache"),
    "x-nextjs-prerender": headerOf(res, "x-nextjs-prerender"),
    "x-matched-path": headerOf(res, "x-matched-path"),
    "age-present": headerOf(res, "age") !== null,
  };
}

/**
 * Walk the redirect chain by hand, one hop at a time.
 *
 * `maxRedirects: 0` on every hop rather than letting the client follow: the
 * chain itself is the record. A 308 and a 200 that carries a client-side
 * redirect are the difference between a fixed defect and a live one in this
 * codebase, and a followed redirect erases the distinction.
 */
async function walkChain(
  api: APIRequestContext,
  baseUrl: string,
  path: string,
  timeoutMs: number,
): Promise<{ chain: RedirectHop[]; final: APIResponse; finalUrl: string }> {
  const chain: RedirectHop[] = [];
  let url = new URL(path, baseUrl).toString();
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const res = await api.get(url, { maxRedirects: 0, timeout: timeoutMs });
    const location = headerOf(res, "location");
    // Origin-normalised, not reduced to a pathname. The same rule the canonical
    // gets (`normalize.ts`): the target's own origin becomes `{origin}`, a
    // third-party origin is left intact, and the query string survives. Keeping
    // only the pathname made a 308 to `https://other-host/shop/x` byte-identical
    // to one to `/shop/x`, and made a hop that gained `?utm_source=…` identical
    // to one that did not.
    chain.push({
      url: normalizeOrigin(url, baseUrl),
      status: res.status(),
      location:
        location === null
          ? null
          : normalizeOrigin(new URL(location, url).toString(), baseUrl),
    });
    if (res.status() >= 300 && res.status() < 400 && location !== null) {
      if (hop === MAX_REDIRECT_HOPS) {
        return { chain, final: res, finalUrl: url };
      }
      url = new URL(location, url).toString();
      continue;
    }
    return { chain, final: res, finalUrl: url };
  }
  throw new Error("unreachable");
}

/**
 * Bring a loaded page to a state where two captures agree.
 *
 * NOTHING HERE MAY DEPEND ON AN IN-PAGE TIMER. An earlier version installed
 * Playwright's fake clock to make timer-driven UI deterministic; fake timers
 * also freeze `setTimeout`, so the scroll-through below awaited a callback that
 * could never fire and the capture wedged with no output. Determinism comes
 * instead from disabling animation, freezing motion in CSS, seeding
 * `Math.random`, and masking the regions that are genuinely time-driven — each
 * of which is stated in the report as the blind spot it is.
 */
async function settle(page: Page): Promise<void> {
  await page
    .waitForLoadState("load", { timeout: 20000 })
    .catch(() => undefined);
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => undefined);
  await page
    .waitForFunction(() => document.fonts.status === "loaded", undefined, {
      timeout: 8000,
    })
    .catch(() => undefined);
  // Force whatever is lazy-loaded below the fold to load, then return to the
  // top so the screenshot starts where the previous run's did. Synchronous:
  // reading `scrollHeight` flushes layout, and no timer is involved.
  await page
    .evaluate(() => {
      const step = window.innerHeight;
      const height = document.body.scrollHeight;
      for (let y = 0; y < height; y += step) {
        window.scrollTo(0, y);
        void document.body.scrollHeight;
      }
      window.scrollTo(0, 0);
      void document.body.scrollHeight;
    })
    .catch(() => undefined);
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => undefined);
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
}

interface DomSignals {
  canonicals: string[];
  ogUrls: string[];
  robotsMetas: string[];
  hrefs: string[];
  jsonldBlocks: string[];
  title: string;
  url: string;
}

async function readDomSignals(page: Page): Promise<DomSignals> {
  return page.evaluate(() => {
    // Every copy, not the first: a page that carries two of one tag is a
    // finding, and "the first one" is document-order dependent.
    const attrs = (selector: string, name: string): string[] =>
      Array.from(document.querySelectorAll(selector)).map(
        (el) => el.getAttribute(name) ?? "",
      );
    return {
      canonicals: attrs('link[rel="canonical"]', "href"),
      ogUrls: attrs('meta[property="og:url"]', "content"),
      robotsMetas: attrs('meta[name="robots"]', "content"),
      hrefs: Array.from(document.querySelectorAll("a[href]")).map(
        (a) => a.getAttribute("href") ?? "",
      ),
      jsonldBlocks: Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => s.textContent ?? ""),
      title: document.title,
      url: window.location.href,
    };
  });
}

/** A screenshot with no locator resolution — safe in a scripting-disabled page. */
async function shootPlain(page: Page, file: string): Promise<ScreenshotRecord> {
  const buffer = await page.screenshot({
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  writeFileSync(file, buffer);
  const image = decodePng(buffer);
  return {
    file,
    width: image.width,
    height: image.height,
    inkRatio: inkRatio(image),
  };
}

async function shoot(
  page: Page,
  file: string,
  selectors: readonly string[],
): Promise<ScreenshotRecord> {
  const buffer = await page.screenshot({
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    scale: "css",
    mask: selectors.map((s) => page.locator(s)),
    maskColor: "#ff00ff",
  });
  writeFileSync(file, buffer);
  const image = decodePng(buffer);
  return {
    file,
    width: image.width,
    height: image.height,
    inkRatio: inkRatio(image),
  };
}

interface Shared {
  readonly plan: CapturePlan;
  readonly args: Args;
  readonly api: APIRequestContext;
  readonly browser: Browser;
  readonly robots: RobotsTxt;
  readonly sitemapPaths: ReadonlySet<string>;
  readonly outDir: string;
  readonly screensDir: string;
}

async function openPage(
  shared: Shared,
  viewport: Viewport,
  javaScriptEnabled: boolean,
  maskCss = "",
): Promise<{
  page: Page;
  blocked: BlockedRequest[];
  close: () => Promise<void>;
}> {
  const context = await shared.browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    userAgent: USER_AGENT,
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    colorScheme: "light",
    reducedMotion: "reduce",
    javaScriptEnabled,
    baseURL: shared.args.baseUrl,
  });
  // Order matters: Playwright consults route handlers in reverse registration
  // order, so the mask injector goes in FIRST and the GET-only guard LAST,
  // which puts the guard in front of it. See `installGetOnlyGuard`.
  if (maskCss !== "") {
    await context.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.fallback();
        return;
      }
      // A GET, fulfilled with the same bytes plus a stylesheet. Nothing else
      // about the response is altered.
      const response = await route.fetch();
      const type = response.headers()["content-type"] ?? "";
      if (!type.includes("html")) {
        await route.fulfill({ response });
        return;
      }
      const body = await response.text();
      const injected = body.includes("</head>")
        ? body.replace("</head>", `${maskCss}</head>`)
        : `${maskCss}${body}`;
      await route.fulfill({ response, body: injected });
    });
  }
  const blocked = await installGetOnlyGuard(context, shared.plan.blockedHosts);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(shared.args.timeoutMs);
  // A modal dialog blocks every subsequent command; dismiss rather than accept,
  // because accepting is an action and this harness takes none.
  page.on("dialog", (dialog) => {
    void dialog.dismiss().catch(() => undefined);
  });
  if (javaScriptEnabled) {
    await page.addInitScript(SEED_RANDOM);
    if (shared.args.freezeClock) {
      await page.addInitScript(FREEZE_DATE);
    }
  }
  return { page, blocked, close: () => context.close() };
}

async function captureTarget(
  shared: Shared,
  target: CaptureTarget,
): Promise<CaptureEntry> {
  const { args, plan } = shared;
  const errors: string[] = [];
  const blockedAll: BlockedRequest[] = [];
  const norm = plan.normalize;
  const origin = args.baseUrl;

  const { chain, final, finalUrl } = await walkChain(
    shared.api,
    args.baseUrl,
    target.path,
    args.timeoutMs,
  );
  const requestedPath = requestedPathOf(target.path, origin);
  const finalPathname = new URL(finalUrl).pathname;
  // Origin-normalised for the same reason every hop is: a final URL that ends
  // up on another host is a finding, and a bare pathname cannot say so.
  const finalPath = normalizeOrigin(finalUrl, origin);
  const contentType = headerOf(final, "content-type") ?? "";
  const isHtml = contentType.includes("html");
  const rawHtml = isHtml ? await final.text() : "";

  let canonical: string | null = null;
  let ogUrl: string | null = null;
  let robotsMeta: string | null = null;
  let jsonld: JsonLdNode[] = [];
  let links: string[] = [];
  let browser: CaptureEntry["browser"] = null;
  let nojs: CaptureEntry["nojs"] = null;
  let desktop: ScreenshotRecord | null = null;
  let mobile: ScreenshotRecord | null = null;

  if (target.mode === "signals") {
    // Signals-only: the flat product URL's "after" is a 308, so it has no page
    // to pair pixels against. Its indexing signals still come off the raw shell
    // when it happens to serve one.
    canonical = joinTagValues(extractCanonicals(rawHtml));
    robotsMeta = joinTagValues(extractRobotsMetas(rawHtml));
  } else {
    const masks = masksForPath(target.path, plan.masks).map((m) => m.selector);
    const stem = slugFor(target.path);

    const view = await openPage(shared, DESKTOP, true);
    try {
      const response = await withTimeout(
        view.page.goto(finalUrl, { waitUntil: "domcontentloaded" }),
        "desktop navigation",
      );
      if (response === null)
        errors.push("desktop navigation produced no response");
      await withTimeout(settle(view.page), "desktop settle");
      const dom = await withTimeout(
        readDomSignals(view.page),
        "desktop signal read",
      );
      canonical = joinTagValues(dom.canonicals);
      ogUrl = joinTagValues(dom.ogUrls);
      robotsMeta = joinTagValues(dom.robotsMetas);
      jsonld = extractJsonLd(dom.jsonldBlocks);
      links = [
        ...new Set(
          dom.hrefs
            .map((h) => normalizeHref(h, origin, dom.url, norm))
            .filter((h): h is string => h !== null),
        ),
      ].sort();
      const browserPath = normalizeOrigin(dom.url, origin);
      browser = {
        finalUrl: browserPath,
        clientSideRedirect: browserPath !== finalPath,
        title: dom.title,
      };
      desktop = await withTimeout(
        shoot(view.page, join(shared.screensDir, `${stem}.desktop.png`), masks),
        "desktop screenshot",
      );
    } catch (err) {
      errors.push(`desktop pass: ${(err as Error).message}`);
    } finally {
      blockedAll.push(...view.blocked);
      await view.close();
    }

    const small = await openPage(shared, MOBILE, true);
    try {
      await withTimeout(
        small.page.goto(finalUrl, { waitUntil: "domcontentloaded" }),
        "mobile navigation",
      );
      await withTimeout(settle(small.page), "mobile settle");
      mobile = await withTimeout(
        shoot(small.page, join(shared.screensDir, `${stem}.mobile.png`), masks),
        "mobile screenshot",
      );
    } catch (err) {
      errors.push(`mobile pass: ${(err as Error).message}`);
    } finally {
      blockedAll.push(...small.blocked);
      await small.close();
    }

    const off = await openPage(shared, DESKTOP, false, maskStylesheet(masks));
    let shot: ScreenshotRecord | null = null;
    try {
      // No `addStyleTag`, no locators, no `evaluate`: every one of those runs
      // script in the page, which is exactly what this pass switches off. The
      // masks arrive as injected CSS (see `maskStylesheet`) and the screenshot
      // is taken straight through the protocol.
      await withTimeout(
        off.page.goto(finalUrl, { waitUntil: "load" }),
        "no-JavaScript navigation",
      );
      shot = await withTimeout(
        shootPlain(off.page, join(shared.screensDir, `${stem}.nojs.png`)),
        "no-JavaScript screenshot",
      );
    } catch (err) {
      errors.push(`no-JavaScript pass: ${(err as Error).message}`);
    } finally {
      blockedAll.push(...off.blocked);
      await off.close();
    }
    // The prerendered-shell metrics are computed on the raw bytes, which no
    // screenshot mask can reach — a mask hides pixels, not characters. A plan
    // rule declared with `field: "all"` is the lever for genuinely volatile
    // text, and the report prints every such rule as the blind spot it is.
    const normalizedHtml = applyRules("all", rawHtml, norm);
    nojs = {
      rawTextLength: htmlToText(normalizedHtml).length,
      rawLinkCount: extractAnchorHrefs(normalizedHtml).length,
      hasNoscript: hasNoscriptContent(normalizedHtml),
      screenshot: shot,
    };
  }

  return {
    key: target.path,
    kind: target.kind,
    mode: target.mode,
    http: {
      chain,
      finalUrl: finalPath,
      finalStatus: final.status(),
      hopCount: chain.length - 1,
      headers: capturedHeaders(final),
    },
    browser,
    indexing: {
      canonical:
        canonical === null
          ? null
          : normalizeValue("canonical", canonical, origin, norm),
      ogUrl:
        ogUrl === null ? null : normalizeValue("og_url", ogUrl, origin, norm),
      robotsMeta:
        robotsMeta === null
          ? null
          : normalizeValue("robots_meta", robotsMeta, origin, norm),
      requested: indexingFor(shared, requestedPath),
      final: indexingFor(shared, finalPathname),
    },
    jsonld: jsonld
      .map((n) => ({
        type: n.type,
        url:
          n.url === null ? null : normalizeValue("jsonld", n.url, origin, norm),
        id: n.id === null ? null : normalizeValue("jsonld", n.id, origin, norm),
      }))
      .sort((a, b) =>
        `${a.type}${a.url}${a.id}`.localeCompare(`${b.type}${b.url}${b.id}`),
      ),
    links,
    nojs,
    screens: { desktop, mobile },
    // Normalised like every other captured URL. Left absolute, a blocked
    // request would carry the target's origin — including an ephemeral port —
    // and two captures of the same target on different origins would differ on
    // a row that says nothing about the storefront.
    blockedRequests: blockedAll.map((r) => ({
      method: r.method,
      url: applyRules("all", normalizeOrigin(r.url, origin), norm),
    })),
    errors,
  };
}

/**
 * The path an inventory entry ASKS for, in the one form both code paths use.
 *
 * Hoisted so the success path and the capture-failure fallback cannot drift.
 * They did: one resolved through `new URL` and the other used the raw string,
 * under a comment claiming they never disagree. They disagree for any path
 * `new URL` normalises — a query string, a percent-escape, a `.`/`..` segment —
 * and the cost is exactly the false positive this keying was introduced to
 * remove: a good run and a failed run reporting a robots.txt or sitemap change
 * that is really just two spellings of the same path. Both shipped inventories
 * happen to be free of such paths today, but an inventory is captured sweep
 * output and the next store's will not be hand-audited.
 */
function requestedPathOf(path: string, baseUrl: string): string {
  return new URL(path, baseUrl).pathname;
}

/** robots.txt verdict and sitemap membership for one path. */
function verdictFor(
  robots: RobotsTxt,
  sitemapPaths: ReadonlySet<string>,
  path: string,
): IndexingByPath {
  return {
    path,
    robotsTxt: robotsVerdict(robots, path),
    inSitemap: sitemapPaths.has(path),
  };
}

function indexingFor(shared: Shared, path: string): IndexingByPath {
  return verdictFor(shared.robots, shared.sitemapPaths, path);
}

/** Read the store's sitemap, following one level of sitemap index. */
async function readSitemap(
  api: APIRequestContext,
  baseUrl: string,
): Promise<Set<string>> {
  const paths = new Set<string>();
  const seed = await api.get(`${baseUrl}/sitemap.xml`, {
    failOnStatusCode: false,
  });
  if (!seed.ok()) return paths;
  const xml = await seed.text();
  const locs = parseSitemapLocs(xml);
  if (isSitemapIndex(xml)) {
    for (const child of locs.slice(0, MAX_SITEMAP_CHILDREN)) {
      const res = await api.get(child, { failOnStatusCode: false });
      if (!res.ok()) continue;
      for (const loc of parseSitemapLocs(await res.text())) {
        paths.add(new URL(loc, baseUrl).pathname);
      }
    }
    return paths;
  }
  for (const loc of locs) paths.add(new URL(loc, baseUrl).pathname);
  return paths;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = loadPlan(args.plan);
  const startedAt = new Date().toISOString();

  const outDir = args.out;
  // `capture.json` is written LAST, after every target has been swept, so its
  // presence means this directory holds a capture that ran to completion — and
  // a completed "before" capture is the one artifact here that cannot be
  // remade once the port has landed. `entries/`/`screens/` without it mean a
  // sweep this tool started and did not finish, which is worth nothing and is
  // cleared without ceremony; that is what keeps `--overwrite` off the command
  // an operator types on an ordinary retry.
  let outcome: OutputDirOutcome;
  try {
    outcome = prepareOutputDir(outDir, {
      flag: "--out",
      completeMarker: "capture.json",
      partialMarkers: ["entries", "screens"],
      overwrite: args.overwrite,
      completeWarning:
        "This may be a pre-port BASELINE capture. Once the port has landed the pre-port state " +
        "does not exist anywhere to be recaptured, and the whole value of this instrument is the " +
        "comparison against it — replacing it destroys evidence, not just a directory.",
    });
  } catch (err) {
    // Refusing to clear the directory is an operator-facing decision, not a
    // crash: it exits 2 with the reason and no stack trace, like every other
    // way this CLI declines to run.
    fail((err as Error).message);
  }
  if (outcome === "cleared-partial") {
    out(
      `port-verify capture: cleared an unfinished capture in ${outDir} (entries/screens present, no capture.json). ` +
        `A partial sweep holds nothing worth keeping, so no flag is needed for this.`,
    );
  }
  const entriesDir = join(outDir, "entries");
  const screensDir = join(outDir, "screens");
  mkdirSync(entriesDir, { recursive: true });
  mkdirSync(screensDir, { recursive: true });

  const api = await playwrightRequest.newContext({
    baseURL: args.baseUrl,
    extraHTTPHeaders: {
      "user-agent": USER_AGENT,
      "accept-language": "en-AU,en;q=0.9",
    },
  });

  const robotsRes = await api.get(`${args.baseUrl}/robots.txt`, {
    failOnStatusCode: false,
  });
  const robotsPresent = robotsRes.ok();
  const robots = robotsPresent
    ? parseRobotsTxt(await robotsRes.text())
    : ROBOTS_ABSENT;
  const sitemapPaths = await readSitemap(api, args.baseUrl);

  const browser = await chromium.launch();
  const shared: Shared = {
    plan,
    args,
    api,
    browser,
    robots,
    sitemapPaths,
    outDir,
    screensDir,
  };

  out(
    `port-verify capture "${args.label}": ${plan.targets.length} URLs on ${args.baseUrl} (plan ${plan.name})`,
  );

  const queue = [...plan.targets];
  const done: CaptureEntry[] = [];
  let lastStart = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const target = queue.shift();
      if (target === undefined) return;
      const wait = lastStart + args.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
      let entry: CaptureEntry;
      try {
        entry = await captureTarget(shared, target);
      } catch (err) {
        const failedPath = requestedPathOf(target.path, args.baseUrl);
        entry = {
          key: target.path,
          kind: target.kind,
          mode: target.mode,
          http: {
            chain: [],
            finalUrl: target.path,
            finalStatus: 0,
            hopCount: 0,
            headers: {
              "content-type": null,
              "cache-control": null,
              "x-nextjs-cache": null,
              "x-vercel-cache": null,
              "x-nextjs-prerender": null,
              "x-matched-path": null,
              "age-present": false,
            },
          },
          browser: null,
          indexing: {
            canonical: null,
            ogUrl: null,
            robotsMeta: null,
            // Both keyed on the requested path — the only path a failed
            // capture knows — and resolved through the SAME helper the success
            // path uses, so the two cannot disagree about what `requested`
            // means. That disagreement is what made a redirecting URL report a
            // bogus robots/sitemap change between a good run and a failed one.
            requested: verdictFor(robots, sitemapPaths, failedPath),
            final: verdictFor(robots, sitemapPaths, failedPath),
          },
          jsonld: [],
          links: [],
          nojs: null,
          screens: { desktop: null, mobile: null },
          blockedRequests: [],
          errors: [`capture failed: ${(err as Error).message}`],
        };
      }
      const stored: CaptureEntry = {
        ...entry,
        screens: {
          desktop: relativizeShot(entry.screens.desktop, outDir),
          mobile: relativizeShot(entry.screens.mobile, outDir),
        },
        nojs:
          entry.nojs === null
            ? null
            : {
                ...entry.nojs,
                screenshot: relativizeShot(entry.nojs.screenshot, outDir),
              },
      };
      writeFileSync(
        join(entriesDir, `${slugFor(target.path)}.json`),
        `${JSON.stringify(stored, null, 2)}\n`,
      );
      done.push(stored);
      out(
        `  ${String(done.length).padStart(3)}/${plan.targets.length}  ${stored.http.finalStatus}  ${target.mode === "signals" ? "signals" : "full   "}  ${target.path}`,
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(args.concurrency, 8)) }, () =>
      worker(),
    ),
  );

  const meta: CaptureRunMeta = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    harnessVersion: HARNESS_VERSION,
    label: args.label,
    baseUrl: args.baseUrl,
    planName: plan.name,
    planPath: plan.planPath,
    startedAt,
    finishedAt: new Date().toISOString(),
    targetCount: plan.targets.length,
    skipped: plan.skipped,
    masks: plan.masks,
    normalize: plan.normalize,
    blockedHosts: plan.blockedHosts,
    viewports: { desktop: DESKTOP, mobile: MOBILE },
    sitemapEntryCount: sitemapPaths.size,
    robotsTxtPresent: robotsPresent,
    clockPinned: args.freezeClock,
  };
  writeFileSync(
    join(outDir, "capture.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  await browser.close();
  await api.dispose();

  const failed = done.filter((e) => e.errors.length > 0);
  out(`port-verify capture "${args.label}" complete -> ${outDir}`);
  if (failed.length > 0) {
    out(
      `  ${failed.length} URL(s) recorded a capture error; they are in the record, not hidden.`,
    );
  }
}

function relativizeShot(
  shot: ScreenshotRecord | null,
  outDir: string,
): ScreenshotRecord | null {
  if (shot === null) return null;
  return { ...shot, file: relative(outDir, shot.file) };
}

await main();
