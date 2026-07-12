import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/revalidate` — dual-auth, fail-closed, tag-bridged webhook (CACHE-02).
 *
 * Proves the full security contract of the phase's primary attack surface:
 *   - unset secret → 503 (fail-closed, threat T-09.5-03)
 *   - GET health returns `configured` boolean, never the value (T-09.5-08)
 *   - auth matrix: valid legacy secret / valid HMAC → 200; wrong secret /
 *     tampered HMAC / missing → 401 (T-09.5-03, T-09.5-05)
 *   - replay window: timestamp just inside 300s → 200, just outside → 401
 *     (T-09.5-04)
 *   - tag allowlist: bridged+validated tags reach `revalidateTag(_, 'max')`,
 *     unknowns are dropped-and-counted, `revalidatePath` still runs (T-09.5-06)
 *   - structured log carries requestId/count/matched/dropped (D8)
 *
 * The test's HMAC construction mirrors the route (raw body bytes, `${ts}.`+body,
 * 300s skew) — it is the executable spec the WP sign-at-send side (09.5-07) must
 * match. `next/cache`, `next/server` (`after` inline, `connection` no-op) and
 * `@/lib/logger` are mocked; `@/lib/cache-tags` runs REAL so bridging is proven.
 * env parses `process.env` at import, so each case sets env then imports fresh.
 */

const { revalidateTag, revalidatePath, loggerInfo, loggerError } = vi.hoisted(
  () => ({
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    loggerInfo: vi.fn(),
    loggerError: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));
vi.mock("next/server", () => ({
  after: (cb: () => void): void => {
    cb();
  },
  connection: async (): Promise<void> => {},
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfo, error: loggerError },
}));

const SECRET = "s3cr3t-revalidate";
const ORIGINAL_ENV = { ...process.env };

function setBaseEnv(): void {
  process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY = "pk_local";
  process.env.HEADKIT_PRIVATE_KEY = "sk_local";
  process.env.NEXT_PUBLIC_GRAPHQL_URL = "http://localhost:4000/graphql";
}

async function loadRoute(): Promise<typeof import("./route")> {
  vi.resetModules();
  return import("./route");
}

/** HMAC exactly as the route verifies it (proves the 09.5-07 WP contract). */
function sign(ts: string, rawBody: string): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}.`)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function post(body: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
  if (headers) init.headers = headers;
  return new Request("http://localhost/api/revalidate", init);
}

describe("/api/revalidate (CACHE-02)", () => {
  beforeEach(() => {
    setBaseEnv();
    revalidateTag.mockClear();
    revalidatePath.mockClear();
    loggerInfo.mockClear();
    loggerError.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  describe("fail-closed secret (T-09.5-03)", () => {
    it("POST with no secret configured → 503 secret_not_configured + logs no_secret", async () => {
      delete process.env.REVALIDATION_SECRET;
      const { POST } = await loadRoute();
      const res = await POST(post({ tags: ["headkit:products"] }));

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toMatchObject({
        error: "secret_not_configured",
      });
      expect(loggerError).toHaveBeenCalledWith(
        "revalidate.no_secret",
        expect.objectContaining({ requestId: expect.any(String) }),
      );
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });

  describe("GET secret health check (T-09.5-08)", () => {
    it("returns { configured: true } / 200 when the secret is set (never the value)", async () => {
      process.env.REVALIDATION_SECRET = SECRET;
      const { GET } = await loadRoute();
      const res = await GET();
      expect(res.status).toBe(200);
      const bodyText = await res.clone().text();
      expect(bodyText).not.toContain(SECRET);
      await expect(res.json()).resolves.toEqual({ configured: true });
    });

    it("returns { configured: false } / 503 when the secret is unset", async () => {
      delete process.env.REVALIDATION_SECRET;
      const { GET } = await loadRoute();
      const res = await GET();
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ configured: false });
    });
  });

  describe("auth matrix (T-09.5-03, T-09.5-05)", () => {
    beforeEach(() => {
      process.env.REVALIDATION_SECRET = SECRET;
    });

    it("valid legacy body-secret → 200", async () => {
      const { POST } = await loadRoute();
      const res = await POST(
        post({ secret: SECRET, tags: ["headkit:products"] }),
      );
      expect(res.status).toBe(200);
      expect(revalidateTag).toHaveBeenCalledWith("headkit:products", "max");
    });

    it("valid HMAC header → 200", async () => {
      const { POST } = await loadRoute();
      const ts = String(nowSeconds());
      const body = { tags: ["headkit:products"] };
      const raw = JSON.stringify(body);
      const res = await POST(
        new Request("http://localhost/api/revalidate", {
          method: "POST",
          body: raw,
          headers: { "x-hk-timestamp": ts, "x-hk-signature": sign(ts, raw) },
        }),
      );
      expect(res.status).toBe(200);
      expect(revalidateTag).toHaveBeenCalledWith("headkit:products", "max");
    });

    it("wrong legacy secret → 401", async () => {
      const { POST } = await loadRoute();
      const res = await POST(
        post({ secret: "not-the-secret", tags: ["headkit:products"] }),
      );
      expect(res.status).toBe(401);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("tampered HMAC (body changed after signing) → 401", async () => {
      const { POST } = await loadRoute();
      const ts = String(nowSeconds());
      const signedRaw = JSON.stringify({ tags: ["headkit:products"] });
      const tamperedRaw = JSON.stringify({ tags: ["headkit:settings"] });
      const res = await POST(
        new Request("http://localhost/api/revalidate", {
          method: "POST",
          body: tamperedRaw,
          headers: {
            "x-hk-timestamp": ts,
            "x-hk-signature": sign(ts, signedRaw),
          },
        }),
      );
      expect(res.status).toBe(401);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("missing both HMAC and body-secret → 401", async () => {
      const { POST } = await loadRoute();
      const res = await POST(post({ tags: ["headkit:products"] }));
      expect(res.status).toBe(401);
    });
  });

  describe("replay window / skew boundary (T-09.5-04)", () => {
    beforeEach(() => {
      process.env.REVALIDATION_SECRET = SECRET;
    });

    it("timestamp just INSIDE 300s skew → 200", async () => {
      const { POST } = await loadRoute();
      const ts = String(nowSeconds() - 299);
      const raw = JSON.stringify({ tags: ["headkit:products"] });
      const res = await POST(
        new Request("http://localhost/api/revalidate", {
          method: "POST",
          body: raw,
          headers: { "x-hk-timestamp": ts, "x-hk-signature": sign(ts, raw) },
        }),
      );
      expect(res.status).toBe(200);
    });

    it("timestamp just OUTSIDE 300s skew → 401", async () => {
      const { POST } = await loadRoute();
      const ts = String(nowSeconds() - 301);
      const raw = JSON.stringify({ tags: ["headkit:products"] });
      const res = await POST(
        new Request("http://localhost/api/revalidate", {
          method: "POST",
          body: raw,
          headers: { "x-hk-timestamp": ts, "x-hk-signature": sign(ts, raw) },
        }),
      );
      expect(res.status).toBe(401);
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });

  describe("tag bridge + allowlist + 'max' + paths + log fields (T-09.5-06, D8)", () => {
    beforeEach(() => {
      process.env.REVALIDATION_SECRET = SECRET;
    });

    it("bridges legacy tags, drops unknowns, calls revalidateTag(_, 'max') + revalidatePath", async () => {
      const { POST } = await loadRoute();
      const res = await POST(
        post({
          secret: SECRET,
          // menu → 1→many fan-out; collections:{slug} → singular; unknown dropped
          tags: [
            "headkit:menu",
            "headkit:collections:sale-items",
            "headkit:totally-unknown",
          ],
          paths: ["/shop"],
        }),
      );
      expect(res.status).toBe(200);

      // Every revalidateTag call carries the literal 'max' second arg (D3).
      for (const call of revalidateTag.mock.calls) {
        expect(call[1]).toBe("max");
      }
      const taggedWith = revalidateTag.mock.calls.map((c) => c[0]);
      expect(taggedWith).toEqual(
        expect.arrayContaining([
          "headkit:menu:PRIMARY",
          "headkit:menu:SECONDARY",
          "headkit:menu:FOOTER",
          "headkit:footer",
          "headkit:collection:sale-items",
        ]),
      );
      // Unknown never reaches the cache runtime.
      expect(taggedWith).not.toContain("headkit:totally-unknown");
      // Paths preserved.
      expect(revalidatePath).toHaveBeenCalledWith("/shop");

      const body = await res.json();
      expect(body.count).toBe(taggedWith.length + 1); // tags + 1 path
    });

    it("dropped count reflects unknown tags removed (no fan-out payload)", async () => {
      const { POST } = await loadRoute();
      await POST(
        post({
          secret: SECRET,
          tags: [
            "headkit:product:shoe", // known
            "headkit:collections:sale-items", // known after bridge → collection:sale-items
            "headkit:totally-unknown", // dropped
            "headkit:another-bad", // dropped
          ],
        }),
      );

      // rawTags = 4, matched = 2 → dropped = 2.
      expect(loggerInfo).toHaveBeenCalledWith(
        "revalidate",
        expect.objectContaining({
          requestId: expect.any(String),
          count: 2,
          dropped: 2,
          tags: expect.arrayContaining([
            "headkit:product:shoe",
            "headkit:collection:sale-items",
          ]),
        }),
      );
    });
  });
});
