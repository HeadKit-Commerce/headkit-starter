import { invalidateByTag } from "@vercel/functions";
import { revalidatePath, revalidateTag } from "next/cache";
import { after, connection } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import {
  bridgeTags,
  invalidatesManyPages,
  isKnownTag,
  tagCoveringPath,
} from "@/lib/cache-tags";
import { getBranding } from "@/lib/branding";
import { isIndexNowProductionHost, submitIndexNow } from "@/lib/indexnow";
import { logger } from "@/lib/logger";
import { resolveSiteUrl } from "@/lib/site-url";
import { hasPurgeApi } from "@/lib/vercel-purge";

/**
 * POST /api/revalidate — the storefront's observable, dual-auth, fail-closed
 * cache-invalidation webhook (CACHE-02, `RECOMMENDATION.md` §3).
 *
 * This is the phase's primary security surface: an untrusted POST can trigger
 * cache invalidation, and this route's auth + tag-allowlist is the ONLY gate.
 * It closes four gaps in the old handler:
 *   1. Fail-closed on a missing secret (`z.string().optional()` previously made
 *      an unset secret an OPEN endpoint — `undefined !== undefined` is false).
 *   2. Dual-auth transition bridge — HMAC-SHA256 over raw bytes OR the legacy
 *      body-secret, both constant-time (`crypto.timingSafeEqual`, never `===`).
 *   3. Tag bridge + strict allowlist (`bridgeTags(...).filter(isKnownTag)`) so
 *      only contract tags reach a purge at all, classified by blast radius
 *      (`invalidatesManyPages`). The WIDE class is INVALIDATED through
 *      `invalidateByTag`, the narrow class DELETED with `{ expire: 0 }`, and a
 *      path whose page a tag in the same payload already covers is skipped so
 *      an unconditional `revalidatePath` delete cannot defeat the invalidate.
 *      `purgeTags` and `tagCoveringPath` own those two halves; they ship
 *      together because either alone is inert.
 *   4. Structured observability — one JSON log per call off the hot path,
 *      carrying `purgeApi`, per-tag `outcomes` and `skippedPaths`, so "did the
 *      purge land, and as which semantic?" is readable rather than assumed.
 *
 * GET is a deploy health check: `{ configured, purgeApi }` (200/503) that never
 * returns the secret's value.
 *
 * Supported body formats (fanned-in — legacy singular kept for today's WP):
 *   Legacy:  { secret, path?: string, tag?: string }
 *   Current: { secret, paths?: string[], tags?: string[], action?: string }
 *
 * HMAC scheme (must match WP sign-at-send, 09.5-07):
 *   header `x-hk-signature` = hex HMAC-SHA256 of `${x-hk-timestamp}.` + raw body
 *   header `x-hk-timestamp` = unix seconds, accepted within ±MAX_SKEW.
 */

const MAX_SKEW_SECONDS = 300;

/**
 * Purge semantics, classified by blast radius (`invalidatesManyPages`).
 *
 * `NARROW_PURGE_PROFILE` is the editor-immediacy path and is unchanged — see
 * the paragraph at the call site.
 *
 * `WIDE_PURGE_PROFILE` is the **FALLBACK** for the wide class, not its primary
 * mechanism: wide tags go to `invalidateByTag` (see `purgeTags`), and this is
 * what they get when the runtime handed this invocation no purge API, or when
 * that call rejected.
 *
 * The value is `{ expire: 0 }` — a deletion — and that direction is deliberate.
 * **Fail towards slow, never towards wrong.** Degrading to a deletion costs the
 * first visitor of each affected page a cold render and stays CORRECT;
 * degrading to nothing leaves the content stale for the whole of its cache life
 * with no error and no log line, which is the failure this route exists to make
 * impossible.
 *
 * A profile-form call (`revalidateTag(t, "max")`) is deliberately NOT used for
 * the wide class. It is textbook stale-while-revalidate as Next.js semantics,
 * but was measured on Vercel not to reach the CDN at all: a purge whose payload
 * named a category grid tag left that category page on `HIT` at age 887 s while
 * the narrow control in the same request was deleted. A named `revalidateTag`
 * profile must not come back here until a runtime log shows one landing.
 */
const WIDE_PURGE_PROFILE = { expire: 0 } as const;
const NARROW_PURGE_PROFILE = { expire: 0 } as const;

/**
 * Vercel documents **16 tags per bulk purge call**. A content payload carries
 * 4-5 tags and the widest observed wide set is 7, so this never binds today —
 * it is here because a silent truncation at the limit would be exactly the
 * class of failure this change exists to end.
 */
const PURGE_TAG_BATCH_SIZE = 16;

/** One tag's purge, as it is recorded in the log line. */
interface PurgeOutcome {
  tag: string;
  /** Blast-radius class, from `invalidatesManyPages`. */
  class: "wide" | "narrow";
  /** The call that actually fired for this tag. */
  mechanism: "invalidateByTag" | "revalidateTag";
  /** Whether that call completed without rejecting. */
  ok: boolean;
}

/** Why the wide class fell back to deletion, or `"none"` when it did not. */
type PurgeFallbackReason = "none" | "no-purge-api" | "rejected" | "not-needed";

interface PurgeResult {
  outcomes: PurgeOutcome[];
  purgeApi: boolean;
  purgeFallback: PurgeFallbackReason;
}

/**
 * Purge every allowlisted tag, splitting by blast radius.
 *
 * - **narrow** → `revalidateTag(t, { expire: 0 })`. A deletion, which is what
 *   the editor reloading that one page seconds after saving it wants, and which
 *   is measured to reach Vercel's CDN.
 * - **wide** → `invalidateByTag(tags)` from `@vercel/functions`, array form,
 *   one call. An invalidation: the CDN keeps serving the existing copy and
 *   refreshes behind the request, instead of deleting thousands of entries and
 *   charging each page's first visitor a foreground render.
 *
 * Called INLINE, not from `after()`. Whether the request context — and so the
 * purge API — survives into `after()` is unverified, and a mechanism that
 * silently resolves into nothing is the thing being fixed. The milliseconds are
 * spent on a webhook nobody is waiting on.
 *
 * On ANY rejection the WHOLE wide set falls back to deletion rather than the
 * failed batch alone: a tag that was already invalidated is then deleted as
 * well, which is the safe direction, and a uniform outcome is far easier to
 * read in a log than a half-applied one.
 */
async function purgeTags(
  tags: readonly string[],
  requestId: string,
): Promise<PurgeResult> {
  const wide = tags.filter((t) => invalidatesManyPages(t));
  const narrow = tags.filter((t) => !invalidatesManyPages(t));
  const outcomes: PurgeOutcome[] = [];

  for (const t of narrow) {
    revalidateTag(t, NARROW_PURGE_PROFILE);
    outcomes.push({
      tag: t,
      class: "narrow",
      mechanism: "revalidateTag",
      ok: true,
    });
  }

  // Probed rather than assumed: `invalidateByTag` returns a RESOLVED promise
  // when the runtime injected no purge API, so the call itself cannot tell us
  // whether anything happened. See `lib/vercel-purge.ts`. This probe is also
  // what keeps the whole path inert off Vercel.
  const purgeApi = hasPurgeApi();
  let purgeFallback: PurgeFallbackReason = "none";

  if (wide.length === 0) {
    purgeFallback = "not-needed";
  } else if (!purgeApi) {
    purgeFallback = "no-purge-api";
  } else {
    try {
      for (let i = 0; i < wide.length; i += PURGE_TAG_BATCH_SIZE) {
        await invalidateByTag(wide.slice(i, i + PURGE_TAG_BATCH_SIZE));
      }
    } catch (error) {
      purgeFallback = "rejected";
      // Never the raw error body — it can carry the upstream payload.
      logger.error("revalidate.invalidate_by_tag_failed", {
        requestId,
        name: error instanceof Error ? error.name : "unknown",
        tags: wide,
      });
    }
  }

  // A rejected invalidate is recorded as its OWN failed row per tag, beside the
  // fallback row that then purged it. Two rows rather than one averaged row:
  // the failure must stay visible after the recovery.
  if (purgeFallback === "rejected") {
    for (const t of wide) {
      outcomes.push({
        tag: t,
        class: "wide",
        mechanism: "invalidateByTag",
        ok: false,
      });
    }
  }

  const invalidated = wide.length > 0 && purgeFallback === "none";
  for (const t of wide) {
    if (!invalidated) revalidateTag(t, WIDE_PURGE_PROFILE);
    outcomes.push({
      tag: t,
      class: "wide",
      mechanism: invalidated ? "invalidateByTag" : "revalidateTag",
      ok: true,
    });
  }

  return { outcomes, purgeApi, purgeFallback };
}

/** Length-guarded constant-time string compare (never `===`; timing side-channel). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Keep only the string members of an unknown value (drops non-string noise). */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Shape of the JSON body (all fields untrusted → `unknown`, narrowed at use). */
interface RevalidateBody {
  secret?: unknown;
  tag?: unknown;
  tags?: unknown;
  path?: unknown;
  paths?: unknown;
  action?: unknown;
}

/** Uniform JSON response carrying the request id (header + body) for tracing. */
function jsonResponse(
  requestId: string,
  status: number,
  body: Record<string, unknown>,
): Response {
  return Response.json(
    { requestId, ...body },
    { status, headers: { "x-revalidate-id": requestId } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  try {
    // Read the raw bytes ONCE so HMAC verifies over exactly what was signed and
    // the JSON is parsed from the same buffer (no double-read / re-encode skew).
    const raw = Buffer.from(await request.arrayBuffer());

    const secret = env.REVALIDATION_SECRET;
    // Fail closed: an unset secret is a misconfiguration, never "authorized".
    if (!secret) {
      logger.error("revalidate.no_secret", { requestId });
      return jsonResponse(requestId, 503, { error: "secret_not_configured" });
    }

    let body: RevalidateBody;
    try {
      body = JSON.parse(raw.toString("utf8")) as RevalidateBody;
    } catch {
      return jsonResponse(requestId, 400, { error: "invalid_json" });
    }

    // --- AUTH BRIDGE: accept EITHER new HMAC OR legacy body-secret ---
    const signature = request.headers.get("x-hk-signature");
    const timestamp = request.headers.get("x-hk-timestamp");
    let authed = false;
    if (signature && timestamp) {
      const ts = Number(timestamp);
      const skew = Math.abs(Date.now() / 1000 - ts);
      if (Number.isFinite(ts) && skew <= MAX_SKEW_SECONDS) {
        const expected = crypto
          .createHmac("sha256", secret)
          .update(`${timestamp}.`)
          .update(raw)
          .digest("hex");
        authed = timingSafeEqualStr(signature, expected);
      }
    } else if (typeof body.secret === "string") {
      authed = timingSafeEqualStr(body.secret, secret);
    }
    if (!authed) {
      return jsonResponse(requestId, 401, { error: "unauthorized" });
    }

    // --- TAG BRIDGE (string→string remap + strict allowlist) + keep paths ---
    const rawTags: string[] = [
      ...asStringArray(body.tags),
      ...(typeof body.tag === "string" ? [body.tag] : []),
    ];
    const paths: string[] = Array.from(
      new Set([
        ...asStringArray(body.paths),
        ...(typeof body.path === "string" ? [body.path] : []),
      ]),
    );

    // Only contract tags survive; unknown / raw-legacy / injected tags dropped
    // (threat T-09.5-06) — measured as `dropped` below.
    const tags = bridgeTags(rawTags).filter(isKnownTag);
    // Immediate expire: WP admin saves are external webhooks — profile "max"
    // only marks stale and keeps serving cached HTML (SWR), so About/Services/
    // Education etc. looked unchanged after save. Next.js docs: webhooks should
    // use `{ expire: 0 }` for Route Handlers.
    //
    // That reasoning is still right, but ONLY for the NARROW tags it was
    // written for (`headkit:page:*`, `headkit:pages`, `headkit:post:*`,
    // `headkit:collection:*`, …): the editor reloads that one page seconds
    // after saving it, so a blocking re-render is what they want. `{ expire: 0 }`
    // leaves no stale window, so the CDN DELETES the entry and its next request
    // blocks on a foreground render.
    //
    // Applied to a whole-catalogue or layout-chrome tag, deletion is an
    // expensive trade. One `headkit:products` purge deletes every PDP and every
    // listing page at once, and each of those pages then costs its first
    // visitor a cold render; a `headkit:branding` purge deletes the entire
    // prerendered site, because a tag the root layout awaits is on every entry
    // by construction. Both are routine merchandising and CMS work, not rare
    // events.
    //
    // The wide class therefore goes to `invalidateByTag` — Vercel's own purge
    // API, handed to the function by the runtime, needing NO token and NO
    // environment variable and so with nothing to leak. `purgeTags` owns the
    // split, the fallback and the per-tag outcomes; `WIDE_PURGE_PROFILE` owns
    // why the fallback is a deletion.
    const { outcomes, purgeApi, purgeFallback } = await purgeTags(
      tags,
      requestId,
    );

    // PATHS — and this half is not optional. `revalidatePath` has no lifetime
    // parameter anywhere in `next/cache`; it is an unconditional DELETE, and a
    // delete beats an invalidate regardless of ordering. Purging the wide tags
    // above and then deleting the same pages by path one line later would make
    // the whole change inert on every page anyone actually looks at, while
    // every log line said the invalidate fired.
    //
    // So a path whose page is ALREADY covered by a tag in this same payload is
    // skipped, and an uncovered one is still purged — never the other way
    // round. `tagCoveringPath` states why the coverage holds by construction,
    // against the theme source it is derived from.
    //
    // `skippedPaths` is logged: if it is ever empty on a product save, the
    // coverage argument has broken.
    const skippedPaths: string[] = [];
    for (const p of paths) {
      if (tagCoveringPath(p, tags)) {
        skippedPaths.push(p);
        continue;
      }
      revalidatePath(p); // WP still sends paths — do NOT drop an uncovered one
    }

    // Structured observability + optional IndexNow notify off the hot path.
    // Never logs the secret / body-secret / raw body.
    //
    // `purgeApi`, `purgeFallback`, `outcomes` and `skippedPaths` each answer a
    // question that was previously unanswerable from a log:
    //   - `purgeApi` — did the runtime hand this invocation a purge API at all?
    //     Without it, "the wide tags invalidated" is an assumption.
    //   - `purgeFallback` — and if not, why the wide class deleted instead.
    //   - `outcomes` — per tag, which branch fired and whether it resolved, so
    //     a partial failure is visible rather than averaged into a total.
    //   - `skippedPaths` — the paths a covering tag made redundant. Empty on a
    //     product save means the coverage argument has broken.
    after(async () => {
      logger.info("revalidate", {
        requestId,
        event: typeof body.action === "string" ? body.action : "tags",
        tags,
        paths,
        count: tags.length + paths.length,
        dropped: rawTags.length - tags.length,
        purgeApi,
        purgeFallback,
        outcomes,
        skippedPaths,
        vercelId: request.headers.get("x-vercel-id"),
      });

      if (paths.length === 0 || !isIndexNowProductionHost()) return;

      try {
        const { seoSettings, storeSettings } = await getBranding();
        if (
          !seoSettings.indexNowEnabled ||
          !seoSettings.allowIndexing ||
          !seoSettings.indexNowKey
        ) {
          return;
        }

        const hostOrigin = resolveSiteUrl(
          storeSettings.domain,
          env.NEXT_PUBLIC_FRONTEND_URL,
        );
        if (!hostOrigin) return;

        await submitIndexNow({
          hostOrigin,
          key: seoSettings.indexNowKey,
          paths,
          requestId,
        });
      } catch (error) {
        logger.error("indexnow.revalidate_hook_error", {
          requestId,
          name: error instanceof Error ? error.name : "unknown",
        });
      }
    });

    return jsonResponse(requestId, 200, {
      revalidated: tags,
      paths,
      count: tags.length + paths.length,
    });
  } catch (error) {
    // Never return the raw error body to the client / logs (threat T-09.5-07).
    logger.error("revalidate.error", {
      requestId,
      name: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse(requestId, 500, { error: "revalidate_failed" });
  }
}

/**
 * GET /api/revalidate — deploy health check. Returns
 * `{ configured: boolean, purgeApi: boolean }` (200 when the secret is set, 503
 * when unset) and NEVER the secret's value, so a misconfigured deploy is
 * visible without leaking it (threat T-09.5-08).
 *
 * `purgeApi` answers "will a wide-tag purge on this deployment invalidate, or
 * fall back to deleting?" WITHOUT waiting for a webhook — the same probe the
 * POST path records, read on demand. It is safe to expose: it is a boolean
 * about the runtime, and there is no credential to carry — the purge API is
 * handed to the function by the platform.
 *
 * `connection()` marks the route request-time so BOTH fields reflect runtime
 * rather than a build-time snapshot (Cache Components bans
 * `export const dynamic`). That matters more for `purgeApi` than for
 * `configured`: the request context only exists during a request.
 *
 * The status code stays keyed on `configured` alone. `purgeApi: false` is a
 * degraded-but-correct state — purges still land, by deletion — so it must not
 * fail a health check and take a storefront out of rotation.
 */
export async function GET(): Promise<Response> {
  await connection();
  const configured = Boolean(env.REVALIDATION_SECRET);
  return Response.json(
    { configured, purgeApi: hasPurgeApi() },
    { status: configured ? 200 : 503 },
  );
}
