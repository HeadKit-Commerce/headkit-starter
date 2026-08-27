import { createClient, type GlobalConfigClient } from "@vercel/global-config";
import { NextResponse, type NextRequest } from "next/server";
import {
  maintenanceContent,
  type MaintenanceContent,
} from "@/overrides/maintenance";

/**
 * Request-time maintenance gate (cutover gate **G6**).
 *
 * Puts one storefront dark — and brings it back — in a single Edge Config
 * write, with no redeploy, so the moment maintenance goes up is a sharp
 * wall-clock instant that a cutover runbook can record as `T+0`.
 *
 * **Operator documentation, including the exact lift command, is in
 * `apps/starter/MAINTENANCE.md`.** Read that first if you are working a window.
 *
 * ---------------------------------------------------------------------------
 * MECHANISM
 * ---------------------------------------------------------------------------
 * The flag lives in a Vercel Edge Config store and is read from `proxy.ts` on
 * every request. Two alternatives were rejected and must not be reintroduced:
 *
 *  - **A build-time env var.** Flipping it needs a redeploy, and this codebase
 *    has a measured incident of a Vercel cache entry serving stale content for
 *    2–3 days after the underlying value changed. A toggle that might take
 *    effect in three days is not a toggle.
 *  - **Reading the flag from WordPress or dashboard-api.** Those are the
 *    systems being changed during a cutover. If the flag's source breaks
 *    mid-window, maintenance mode breaks at the exact moment it is needed.
 *    Edge Config is independent of everything being migrated, and that
 *    independence — not its speed — is why it was chosen.
 *
 * The *connection string* is build-time, and that is fine: it is a pointer plus
 * a read token, not the value. The value behind it is fetched per request.
 *
 * WHICH VARIABLE HOLDS IT DEPENDS ON THE PLATFORM VERSION, and getting this
 * wrong is silent and open — the gate simply never arms and every request is
 * served normally, with nothing reporting it. Vercel has renamed the product
 * (`vercel global-config`, "Global Config store"), and a store connected today
 * injects **`GLOBAL_CONFIG`**; older projects carry `EDGE_CONFIG`. Verified on
 * `headkit-starter-staging` on 2026-08-25: `GLOBAL_CONFIG` present on
 * Production/Preview/Development, no `EDGE_CONFIG` at all. Both names are
 * accepted here, resolved ONCE in `connectionString()` and used for both the
 * armed check and the client the read goes through — never re-derived, and
 * never worked around by hand-copying the connection string into a second
 * variable (that duplicates a read token and drifts the moment the connection
 * is rotated or reconnected).
 *
 * ---------------------------------------------------------------------------
 * ONE KEY PER HOST — NEVER A ROOT BOOLEAN
 * ---------------------------------------------------------------------------
 * The Edge Config store is TEAM-level and is connected to every storefront
 * project on the team. A single boolean at the root would therefore be a
 * fleet-wide kill switch: one flip would darken every storefront at once,
 * including stores trading normally that have nothing to do with the window.
 *
 * So the gate reads ONE key derived from the request's own host
 * (`maintenanceKeyForHost`), e.g.
 *
 *     www.dishee.com.au        ->  maintenance_www_dishee_com_au
 *     dishee-rehearsal.vercel.app -> maintenance_dishee_rehearsal_vercel_app
 *
 * A host with no entry — the normal case for every store not in a window — is
 * simply not in maintenance. There is deliberately NO fleet-wide key: a switch
 * that darkens every store on the team is a larger blast radius than this gate
 * is for, and nobody would notice it existed until the day it fired. If one is
 * ever genuinely wanted it must be added as a separate, explicitly named key.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------
 * Maintenance mode is a **sign, not a fence**. It cannot stop checkouts: a
 * shopper already at the payment provider is outside this origin entirely. The
 * fence is a single WooCommerce option write disabling the payment gateway, and
 * the proof the drain took is that gateway disappearing from the Store API.
 * Nothing here claims otherwise.
 */

/** Prefix for every per-host key in the Edge Config store. */
const KEY_PREFIX = "maintenance";

/** Query param that grants the operator bypass (converted to a cookie). */
const BYPASS_PARAM = "hk-maintenance-bypass";

/** Cookie the operator bypass is carried in once granted. */
const BYPASS_COOKIE = "hk-maintenance-bypass";

/** How long a granted bypass lasts, in seconds (one long window). */
const BYPASS_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * Shortest accepted bypass secret. A short secret is worse than none: it looks
 * like protection while being guessable, and the bypass is a hole straight
 * through the gate on the live domain.
 */
const MIN_BYPASS_SECRET_LENGTH = 16;

/** `Retry-After` when the flag value does not specify one. */
const DEFAULT_RETRY_AFTER_SECONDS = 3600;

/**
 * Ceiling on the Edge Config read. The gate is on the hot path for every
 * shopper request, so a hung read must not become a hung storefront: past this
 * the read counts as failed and the fail-path below decides.
 */
const READ_TIMEOUT_MS = 1000;

/** Cap on the last-known-state memo (see `rememberState`). */
const MEMO_MAX_ENTRIES = 32;

/** Normalised maintenance flag. */
export interface MaintenanceFlag {
  enabled: boolean;
  retryAfterSeconds: number;
  /** Per-window copy override; wins over `overrides/maintenance.ts`. */
  headline?: string;
  message?: string;
}

/**
 * Why the store is dark, echoed as `x-hk-maintenance`: the flag said so, or the
 * flag could not be read and this host was last seen dark.
 */
export type MaintenanceSource = "flag" | `fail-closed:${string}`;

/** What `decide()` concluded, and on what basis. */
interface MaintenanceDecision {
  flag: MaintenanceFlag | null;
  source: MaintenanceSource;
}

/** Outcome of one flag read — the input to the fail-path decision. */
export type MaintenanceRead =
  | { state: "on"; flag: MaintenanceFlag }
  | { state: "off" }
  | { state: "unreadable"; reason: string };

/**
 * Last successfully-read FLAG per key, for THIS instance (`null` = was up).
 *
 * This is what makes the fail-path safe on a team-level Edge Config store; see
 * `decide()`. It holds the whole flag rather than a boolean so a fail-closed
 * 503 still carries the window's own `Retry-After` and copy — a shopper must
 * not see the wording change the moment an Edge Config read fails.
 */
const lastKnownFlag = new Map<string, MaintenanceFlag | null>();

function rememberState(key: string, flag: MaintenanceFlag | null): void {
  // Host is attacker-controlled (any `Host` header derives a key), so the memo
  // is capped rather than left to grow unbounded.
  if (!lastKnownFlag.has(key) && lastKnownFlag.size >= MEMO_MAX_ENTRIES) {
    const oldest = lastKnownFlag.keys().next().value;
    if (oldest !== undefined) lastKnownFlag.delete(oldest);
  }
  lastKnownFlag.set(key, flag);
}

/**
 * Public host of the request, lowercased and without its port.
 *
 * `x-forwarded-host` is what Vercel sets to the host the shopper actually
 * asked for; `host` is the local fallback (dev, `next start`, Docker).
 */
export function requestHost(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  const host = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  // Strip the port: `localhost:3000` and `localhost:3111` are the same store.
  return host.replace(/:\d+$/, "");
}

/**
 * Edge Config key for a host.
 *
 * Edge Config keys accept `[A-Za-z0-9_-]`, and hostnames contain dots, so every
 * character outside that set collapses to `_`. The mapping is deliberately
 * dumb and lossy-in-one-direction: the operator never has to guess it, because
 * `MAINTENANCE.md` states it and the 503 echoes the key it read back in
 * `x-hk-maintenance-key`.
 *
 * `www.` is NOT stripped. A store served on both apex and `www` needs a key for
 * whichever host shoppers actually reach (on Vercel the apex redirect happens
 * ahead of this gate, so that is normally `www` alone).
 */
export function maintenanceKeyForHost(host: string): string {
  const normalized = host.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized.length > 0 ? `${KEY_PREFIX}_${normalized}` : KEY_PREFIX;
}

/**
 * Normalise whatever is in Edge Config into a flag.
 *
 * Both shapes are supported so the one-action lift can be as simple as writing
 * `false`, while a window that needs custom copy or a different `Retry-After`
 * can write an object:
 *
 *     true
 *     { "enabled": true, "retryAfterSeconds": 900, "headline": "…", "message": "…" }
 *
 * Anything else (a string, `null`, a missing key) reads as OFF: an unparseable
 * value must not darken a store by accident.
 */
export function normalizeFlag(value: unknown): MaintenanceFlag {
  if (value === true) {
    return { enabled: true, retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS };
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.enabled !== true) {
      return { enabled: false, retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS };
    }
    const raw = record.retryAfterSeconds;
    const retryAfterSeconds =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : DEFAULT_RETRY_AFTER_SECONDS;
    return {
      enabled: true,
      retryAfterSeconds,
      ...(typeof record.headline === "string"
        ? { headline: record.headline }
        : {}),
      ...(typeof record.message === "string"
        ? { message: record.message }
        : {}),
    };
  }
  return { enabled: false, retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS };
}

/**
 * The connection string, from either name, resolved in ONE place.
 *
 * `GLOBAL_CONFIG` is what Vercel injects today; `EDGE_CONFIG` is the older
 * name, still injected on projects connected before the rename. Empty string
 * means no store is connected — the gate is unarmed.
 *
 * Read straight from `process.env` for the same reason `bypassSecret()` is: this
 * module is bundled into the proxy and must not pull the Zod env module in
 * front of every request.
 */
function connectionString(): string {
  return process.env.GLOBAL_CONFIG ?? process.env.EDGE_CONFIG ?? "";
}

/**
 * Client for the resolved connection string, built once per string.
 *
 * Constructed explicitly rather than using the SDK's default `get`, which reads
 * the environment itself: the armed check and the read must agree on ONE
 * resolved value, or the gate can believe it is armed while reading from
 * somewhere else (or, as shipped in the first cut of this file, believe it is
 * unarmed forever because it looked for a variable the platform no longer sets).
 *
 * `null` means the string is present but unusable. That is reported rather than
 * silently swallowed — see `maintenanceGate`.
 */
let clientCache: {
  connection: string;
  client: GlobalConfigClient | null;
} | null = null;

function maintenanceClient(connection: string): GlobalConfigClient | null {
  if (clientCache?.connection !== connection) {
    let client: GlobalConfigClient | null = null;
    try {
      client = createClient(connection);
    } catch {
      client = null;
    }
    clientCache = { connection, client };
  }
  return clientCache.client;
}

/**
 * Read one key from Edge Config.
 *
 * `consistentRead: true` is load-bearing, not a default. Without it the SDK
 * prefers a locally-embedded copy of the config (`/opt/edge-config/<id>.json`
 * on a Function, an in-memory SWR cache in development), and either can lag a
 * flip. A gate whose whole purpose is a sharp `T+0` cannot read a snapshot; it
 * pays one origin read per request instead, and that cost lands only on stores
 * that have an Edge Config connected.
 *
 * The SDK has no timeout of its own, so one is imposed here. The timer is
 * always cleared — on the hot path of an armed storefront an uncleared one is a
 * pending timer per request, and under the Node middleware runtime a pending
 * timer can hold the invocation open. The SDK exposes no `AbortSignal`, so a
 * read that loses the race keeps running to completion in the background; that
 * is bounded by the SDK's own fetch and affects nothing but itself, because the
 * decision has already been made without it.
 */
export async function readMaintenanceFlag(
  key: string,
  client: GlobalConfigClient,
): Promise<MaintenanceRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      client.get(key, { consistentRead: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS);
      }),
    ]);
    const flag = normalizeFlag(value);
    return flag.enabled ? { state: "on", flag } : { state: "off" };
  } catch (error) {
    // Never surface the SDK's message to a shopper — it can carry the store id.
    return {
      state: "unreadable",
      reason: error instanceof Error ? error.name : "unknown",
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * THE FAIL PATH — decided deliberately; do not change it without reading this.
 *
 * Three states, not two:
 *
 *  1. **No `EDGE_CONFIG` connected** → serve normally. Every store on the
 *     platform is in this state right now. The gate must be completely inert
 *     until a store is deliberately connected, or merging it would darken the
 *     fleet.
 *  2. **Connected, key absent or `enabled` not `true`** → serve normally. This
 *     is the steady state of every connected store that is not in a window.
 *  3. **Connected, read failed** (network, timeout, 401, store deleted) →
 *     **fail closed IF this instance has already seen this host darkened**,
 *     otherwise serve normally.
 *
 * Why case 3 is split rather than a flat "fail closed". The Edge Config store
 * is team-level and will be connected to every storefront project, so a flat
 * fail-closed turns any Edge Config incident into a fleet-wide outage of stores
 * that were trading normally — a far larger and far more likely harm than the
 * one this gate protects against. Scoping the closed failure to hosts already
 * known to be dark keeps the window protected from `T+0` onward (the only
 * period where serving a shop that transacts into a half-migrated backend is
 * possible) while leaving the rest of the fleet up.
 *
 * The residual gap is honest and bounded: between the operator's write and a
 * given instance's first successful read of it, a read failure on that instance
 * would serve the shop. The runbook closes it the way it must be closed
 * anyway — by verifying the flip with a request, not by trusting the write.
 *
 * Note there are TWO layers here, and the memo is the second. The SDK answers a
 * 5xx from a cached response of its own (`stale-if-error`), so most transient
 * failures never reach this function at all — they replay the last good value
 * and the 503 is still labelled `flag`. What reaches the memo is a failure the
 * SDK cannot paper over: a revoked token or deleted store (it throws on 401 and
 * on a 404 without a digest header), a network error with a cold cache, or this
 * module's own timeout. Measured both ways in `scripts/smoke/maintenance-gate.sh`.
 */
function decide(key: string, read: MaintenanceRead): MaintenanceDecision {
  if (read.state === "on") {
    rememberState(key, read.flag);
    return { flag: read.flag, source: "flag" };
  }
  if (read.state === "off") {
    rememberState(key, null);
    return { flag: null, source: "flag" };
  }
  const remembered = lastKnownFlag.get(key) ?? null;
  return { flag: remembered, source: `fail-closed:${read.reason}` };
}

/**
 * Paths that keep answering with the flag ON.
 *
 * Enumerated from the route tree, not from a wishlist — each entry is here
 * because 503ing it breaks something that outlives the window:
 *
 *  - `/api/revalidate` — otherwise the store cannot be refreshed while dark,
 *    which is exactly when content is being changed.
 *  - `/api/checkout/confirm` AND `/checkout/finalising`, its only redirect
 *    target — the migration safety net for a shopper returned by their bank
 *    hours later. The handler is read-only by construction (it redirects and
 *    logs; it cannot create or mutate an order), and its one structured log line
 *    is the only record that a stranded shopper existed. Exempting the handler
 *    alone would 303 that shopper — card already charged — straight into the
 *    maintenance page, so the pair travels together. The holding page is safe to
 *    serve dark: it performs NO data read of any kind by construction (see its
 *    own file header), renders no order figures, and is already `noindex`.
 *  - `/api/posts-base-path` — `proxy.ts` fetches this from inside itself.
 *  - `/api/indexnow-key` and the `/{key}.txt` files it serves — a search-engine
 *    ownership proof, another silent long-tail failure.
 *  - `/robots.txt` — a 5xx robots.txt makes Googlebot treat the whole site as
 *    disallowed. On a store being migrated for its SEO that is the worst
 *    possible side effect of going dark for an afternoon.
 *  - `/_next/` and `/_vercel/` — framework and platform internals (asset
 *    chunks, analytics/monitoring beacons). Dotted static paths and
 *    `_next/static` never reach the gate at all: `proxy.ts`'s matcher already
 *    excludes them, which is also why the maintenance page can safely reference
 *    a same-origin `public/` asset such as `/icon-default.svg`.
 *
 * NOT exempt, deliberately: `/api/checkout/sync-line-items` (it mutates a
 * live Stripe session), `/api/icon` and `/api/branding-font` (both reach
 * dashboard-api — the maintenance page must not depend on a system being
 * migrated, so it references neither).
 */
const EXEMPT_PATHS: ReadonlySet<string> = new Set([
  "/api/revalidate",
  "/api/checkout/confirm",
  "/checkout/finalising",
  "/api/posts-base-path",
  "/api/indexnow-key",
  "/robots.txt",
]);

const EXEMPT_PREFIXES: readonly string[] = ["/_next/", "/_vercel/"];

/**
 * IndexNow ownership files live at the host root (`/{key}.txt`, 8–128 chars).
 *
 * Exported and imported by `proxy.ts` rather than written twice: the same shape
 * drives the rewrite there and the exemption here, and two independent literals
 * would let a widened pattern silently start 503ing the ownership file the
 * other one rewrites — exactly the silent, long-tailed failure this exemption
 * exists to prevent. Capture group 1 is the key.
 */
export const INDEXNOW_KEY_FILE = /^\/([a-zA-Z0-9-]{8,128})\.txt$/;

/** True when `pathname` must keep answering while the store is dark. */
export function isMaintenanceExempt(pathname: string): boolean {
  if (EXEMPT_PATHS.has(pathname)) return true;
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return true;
  return INDEXNOW_KEY_FILE.test(pathname);
}

/**
 * Constant-time string compare.
 *
 * Runtime-agnostic on purpose: `node:crypto`'s `timingSafeEqual` exists under
 * the Node middleware runtime (Next 16's default for `proxy.ts`) but not under
 * the Edge one, and which of the two this compiles for is a config away. So
 * this compares every character of the longer string and folds the length
 * difference into the result rather than returning early on the first
 * mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * The operator bypass secret, or `null` when no usable bypass is configured.
 *
 * Read straight from `process.env` rather than through `lib/env.ts`: this
 * module is bundled into the proxy, and importing the Zod env module there
 * would put a validation throw in front of EVERY request to the storefront —
 * for variables the proxy does not use. `MAINTENANCE_BYPASS_SECRET` is
 * documented in `MAINTENANCE.md`.
 *
 * An unset or too-short secret means the bypass does not exist — it never
 * degrades into "everyone bypasses".
 */
function bypassSecret(): string | null {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET ?? "";
  return secret.length >= MIN_BYPASS_SECRET_LENGTH ? secret : null;
}

/**
 * Why the bypass is keyed on a shared secret rather than an IP allowlist:
 * the team works a window from several networks (and from mobile), so an
 * allowlist would lock out the people running the cutover — while a secret
 * travels with the person. It is granted once via `?hk-maintenance-bypass=…`
 * and then held in an httpOnly cookie, so the secret does not stay in the
 * address bar, the browser history, or a `Referer` header, and normal
 * navigation works from then on.
 */
function grantBypass(
  request: NextRequest,
  secret: string,
): NextResponse | null {
  const supplied = request.nextUrl.searchParams.get(BYPASS_PARAM);
  if (supplied === null) return null;
  if (!timingSafeEqual(supplied, secret)) return null;

  const url = request.nextUrl.clone();
  url.searchParams.delete(BYPASS_PARAM);
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: BYPASS_COOKIE,
    value: secret,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: BYPASS_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function hasBypassCookie(request: NextRequest, secret: string): boolean {
  const cookie = request.cookies.get(BYPASS_COOKIE)?.value;
  return typeof cookie === "string" && timingSafeEqual(cookie, secret);
}

/** Minimal HTML escaping for values interpolated into the page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DEFAULT_CONTENT: Required<
  Pick<
    MaintenanceContent,
    "title" | "headline" | "message" | "background" | "foreground" | "accent"
  >
> = {
  title: "Back shortly",
  headline: "We're back shortly",
  message:
    "Our online shop is briefly offline while we make some changes. Please check back soon.",
  background: "#f7f7f5",
  foreground: "#3f3f46",
  accent: "#18181b",
};

/**
 * The maintenance page: ONE self-contained HTML document.
 *
 * No stylesheet link, no font request, no script, no image unless a store
 * points `logoSrc` at a same-origin `public/` asset. That is not minimalism for
 * its own sake — every external reference would be a way for this page to
 * render broken on the one day it is served.
 */
export function renderMaintenancePage(flag: MaintenanceFlag): string {
  const content = { ...DEFAULT_CONTENT, ...maintenanceContent };
  const headline = escapeHtml(flag.headline ?? content.headline);
  const message = escapeHtml(flag.message ?? content.message);
  const title = escapeHtml(content.title);
  const footer = maintenanceContent.footer
    ? `<p class="footer">${escapeHtml(maintenanceContent.footer)}</p>`
    : "";
  const logo = maintenanceContent.logoSrc
    ? `<img class="logo" src="${escapeHtml(maintenanceContent.logoSrc)}" alt="" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title}</title>
<style>
  :root {
    --bg: ${escapeHtml(content.background)};
    --fg: ${escapeHtml(content.foreground)};
    --accent: ${escapeHtml(content.accent)};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 32rem; text-align: center; }
  .logo { max-width: 160px; height: auto; margin: 0 auto 28px; display: block; }
  h1 {
    margin: 0 0 12px;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    line-height: 1.2;
    color: var(--accent);
    letter-spacing: -0.02em;
  }
  p { margin: 0 0 8px; font-size: 1.0625rem; }
  .footer { margin-top: 24px; font-size: 0.9375rem; opacity: 0.75; }
</style>
</head>
<body>
<main>
${logo}
<h1>${headline}</h1>
<p>${message}</p>
${footer}
</main>
</body>
</html>
`;
}

/**
 * The 503 itself.
 *
 * `503` and never `200`: a maintenance page served as `200` is indexable
 * content, and this project has already had a rehearsal URL reach a search
 * engine. `Retry-After` tells crawlers this is temporary, `X-Robots-Tag` says
 * so a second way, and `no-store` keeps the dark page out of every cache so
 * lifting maintenance is as sharp as raising it.
 */
export function maintenanceResponse(
  flag: MaintenanceFlag,
  key: string,
  source: MaintenanceSource,
): NextResponse {
  return new NextResponse(renderMaintenancePage(flag), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(flag.retryAfterSeconds),
      "Cache-Control": "no-store, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
      // Echo the key that was read, so an operator who named it wrong can see
      // the name the storefront is actually looking for.
      "x-hk-maintenance-key": key,
      // `flag` = the value said so; `fail-closed:<reason>` = the value could not
      // be read and this host was last seen dark. An operator watching a window
      // needs to tell those apart from outside, and there is no logger under
      // the proxy to tell them any other way.
      "x-hk-maintenance": source,
    },
  });
}

/** What `proxy.ts` does with the gate's verdict. */
export interface MaintenanceGateResult {
  /** Serve this instead of the app (503, or the bypass-grant redirect). */
  response: NextResponse | null;
  /** Key this host resolves to, echoed on pass-through when the gate is armed. */
  key: string | null;
  /** Echoed as `x-hk-maintenance` on pass-through; `null` when unarmed. */
  state: string | null;
}

const PASS: MaintenanceGateResult = { response: null, key: null, state: null };

/**
 * Run the gate for one request.
 *
 * Order matters and is deliberate:
 *  1. unarmed (no `EDGE_CONFIG`) — leave, before doing any work at all;
 *  2. bypass — so an operator can work the window even if Edge Config is
 *     unreachable, and without paying a read;
 *  3. exemptions — so they answer even if Edge Config is unreachable;
 *  4. the flag read.
 *
 * Nothing before step 4 touches the network, and step 4 is the only network
 * call the gate ever makes — in particular it runs BEFORE `proxy.ts`'s
 * `/api/posts-base-path` self-fetch, so a dark store never waits on the API.
 */
export async function maintenanceGate(
  request: NextRequest,
): Promise<MaintenanceGateResult> {
  const connection = connectionString();
  if (!connection) return PASS;

  const key = maintenanceKeyForHost(requestHost(request));
  const client = maintenanceClient(connection);
  if (!client) {
    // A connected-but-unusable string must not 503 the storefront (the gate
    // ships inert by design), but it must not be invisible either: this is the
    // one state where an operator would otherwise flip the flag and watch
    // nothing happen. `x-hk-maintenance: unarmed:invalid-connection` on every
    // response is how they find it in a curl instead of an afternoon.
    return { response: null, key, state: "unarmed:invalid-connection" };
  }

  const secret = bypassSecret();
  if (secret) {
    const granted = grantBypass(request, secret);
    if (granted) return { response: granted, key, state: "bypass" };
    if (hasBypassCookie(request, secret)) {
      return { response: null, key, state: "bypass" };
    }
  }

  if (isMaintenanceExempt(request.nextUrl.pathname)) {
    return { response: null, key, state: "exempt" };
  }

  const { flag, source } = decide(key, await readMaintenanceFlag(key, client));
  return flag
    ? { response: maintenanceResponse(flag, key, source), key, state: source }
    : { response: null, key, state: source };
}

/** Test seam: clear the per-instance last-known-state memo. */
export function resetMaintenanceMemoForTests(): void {
  lastKnownFlag.clear();
}
