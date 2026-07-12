import { revalidatePath, revalidateTag } from "next/cache";
import { after, connection } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { bridgeTags, isKnownTag } from "@/lib/cache-tags";
import { logger } from "@/lib/logger";

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
 *      only contract tags reach `revalidateTag`, and `revalidateTag(t,'max')`.
 *   4. Structured observability — one JSON log per call off the hot path.
 *
 * GET is a secret health check: `{ configured: boolean }` (200/503) that never
 * returns the value.
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
    for (const t of tags) revalidateTag(t, "max"); // D3 — replaces "default"
    for (const p of paths) revalidatePath(p); // WP still sends paths — do NOT drop

    // Structured observability off the response hot path (D8). Never logs the
    // secret / body-secret / raw body.
    after(() => {
      logger.info("revalidate", {
        requestId,
        event: typeof body.action === "string" ? body.action : "tags",
        tags,
        paths,
        count: tags.length + paths.length,
        dropped: rawTags.length - tags.length,
        vercelId: request.headers.get("x-vercel-id"),
      });
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
 * GET /api/revalidate — secret health check. Returns `{ configured: boolean }`
 * (200 when the secret is set, 503 when unset) and NEVER the value, so a
 * misconfigured deploy is visible without leaking the secret (threat T-09.5-08).
 * `connection()` marks it request-time so the response reflects runtime env
 * rather than a build-time snapshot (Cache Components bans `export const dynamic`).
 */
export async function GET(): Promise<Response> {
  await connection();
  const configured = Boolean(env.REVALIDATION_SECRET);
  return Response.json({ configured }, { status: configured ? 200 : 503 });
}
