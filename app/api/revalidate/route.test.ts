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
 *   - tag allowlist: bridged+validated tags reach a purge, unknowns are
 *     dropped-and-counted, `revalidatePath` still runs (T-09.5-06)
 *   - purge semantics: WIDE tags (whole catalogue / whole route family / root-
 *     layout chrome) go to `invalidateByTag`, so their pages keep serving while
 *     they refresh instead of blocking on a cold render; NARROW tags keep
 *     `revalidateTag(t, { expire: 0 })` so the editor's next load is fresh. The
 *     fallback on an absent purge context or a rejected call is the deletion —
 *     fail towards slow, never towards wrong.
 *   - path classification: a path whose page a tag in the SAME payload already
 *     covers is NOT passed to `revalidatePath`, because that call is an
 *     unconditional delete and a delete beats an invalidate. Without it the
 *     whole change is inert on every page anyone looks at.
 *   - structured log carries requestId/count/matched/dropped, plus `purgeApi`,
 *     per-tag `outcomes` and `skippedPaths` (D8)
 *
 * The test's HMAC construction mirrors the route (raw body bytes, `${ts}.`+body,
 * 300s skew) — it is the executable spec the WP sign-at-send side (09.5-07) must
 * match. `next/cache`, `@vercel/functions`, `@/lib/vercel-purge`, `next/server`
 * (`after` inline, `connection` no-op) and `@/lib/logger` are mocked;
 * `@/lib/cache-tags` runs REAL so bridging AND the path-coverage rule are proven
 * through their real implementations. env parses `process.env` at import, so
 * each case sets env then imports fresh.
 *
 * `hasPurgeApi` is mocked to TRUE by default. That is a deliberate declaration,
 * not an inherited state: nothing in a vitest process installs Vercel's request
 * context, so the real probe would answer `false` and every case below would
 * silently exercise the fallback path instead of the mechanism it names.
 */

const {
  revalidateTag,
  revalidatePath,
  invalidateByTag,
  hasPurgeApi,
  loggerInfo,
  loggerError,
  getBranding,
} = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateByTag: vi.fn(async (_tags: string | string[]): Promise<void> => {}),
  hasPurgeApi: vi.fn(() => true),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  getBranding: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));
vi.mock("@vercel/functions", () => ({ invalidateByTag }));
vi.mock("@/lib/vercel-purge", () => ({ hasPurgeApi }));
vi.mock("next/server", () => ({
  after: (cb: () => void | Promise<void>): void => {
    void cb();
  },
  connection: async (): Promise<void> => {},
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfo, error: loggerError },
}));
vi.mock("@/lib/branding", () => ({
  getBranding: getBranding,
}));
vi.mock("@/lib/indexnow", () => ({
  isIndexNowProductionHost: (): boolean => false,
  submitIndexNow: vi.fn(),
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
    invalidateByTag.mockClear();
    invalidateByTag.mockImplementation(
      async (_tags: string | string[]): Promise<void> => {},
    );
    hasPurgeApi.mockClear();
    hasPurgeApi.mockReturnValue(true);
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
      expect(invalidateByTag).not.toHaveBeenCalled();
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
      await expect(res.json()).resolves.toEqual({
        configured: true,
        purgeApi: true,
      });
    });

    it("returns { configured: false } / 503 when the secret is unset", async () => {
      delete process.env.REVALIDATION_SECRET;
      const { GET } = await loadRoute();
      const res = await GET();
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        configured: false,
        purgeApi: true,
      });
    });

    // `purgeApi` answers "will a wide purge on this deployment invalidate, or
    // fall back to deleting?" without waiting for a webhook. It must NEVER
    // change the status code: `purgeApi: false` is degraded-but-correct —
    // purges still land, by deletion — so failing the health check would take a
    // working storefront out of rotation.
    it("reports purgeApi: false without failing the health check", async () => {
      process.env.REVALIDATION_SECRET = SECRET;
      hasPurgeApi.mockReturnValue(false);
      const { GET } = await loadRoute();
      const res = await GET();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        configured: true,
        purgeApi: false,
      });
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
      // `headkit:products` is WIDE, so it invalidates rather than deleting.
      expect(invalidateByTag).toHaveBeenCalledWith(["headkit:products"]);
      expect(revalidateTag).not.toHaveBeenCalled();
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
      expect(invalidateByTag).toHaveBeenCalledWith(["headkit:products"]);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("wrong legacy secret → 401", async () => {
      const { POST } = await loadRoute();
      const res = await POST(
        post({ secret: "not-the-secret", tags: ["headkit:products"] }),
      );
      expect(res.status).toBe(401);
      expect(revalidateTag).not.toHaveBeenCalled();
      expect(invalidateByTag).not.toHaveBeenCalled();
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
      expect(invalidateByTag).not.toHaveBeenCalled();
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
      expect(invalidateByTag).not.toHaveBeenCalled();
    });
  });

  describe("tag bridge + allowlist + purge semantics + paths + log fields (T-09.5-06, D8)", () => {
    beforeEach(() => {
      process.env.REVALIDATION_SECRET = SECRET;
    });

    it("bridges legacy tags, drops unknowns, purges each by its class + revalidatePath", async () => {
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

      // What this case is about is the BRIDGE — which tags survive the remap —
      // so it asserts over both purge branches rather than one. The split
      // itself is "purge semantics split by blast radius" below.
      const deletedWith = revalidateTag.mock.calls.map((c) => c[0] as string);
      const invalidatedWith = invalidateByTag.mock.calls.flatMap(
        (c) => c[0] as string[],
      );
      const taggedWith = [...invalidatedWith, ...deletedWith];
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
      // The fanned-out chrome tags are on the root layout's entries, so they
      // INVALIDATE; the single collection entity still deletes for the editor.
      expect(invalidatedWith).toContain("headkit:menu:PRIMARY");
      expect(invalidatedWith).toContain("headkit:footer");
      expect(deletedWith).toEqual(["headkit:collection:sale-items"]);
      for (const call of revalidateTag.mock.calls) {
        expect(call[1]).toEqual({ expire: 0 });
      }
      // Paths preserved — `/shop` has no covering tag in this payload.
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

  /**
   * Purge semantics per blast radius. The classification itself is
   * `lib/cache-tags.test.ts`'s and the path-coverage rule is
   * `tagCoveringPath`'s; what these cases hold is the WIRING — that the route
   * asks `invalidatesManyPages`, routes each class to its own mechanism, falls
   * back in the safe direction, and skips a path a tag already covers.
   * Asserted on the CALLS, never on a snapshot.
   *
   * The limit is stated rather than implied: `next/cache` and
   * `@vercel/functions` are mocked here, so NOTHING in this file can observe
   * whether `invalidateByTag` reaches Vercel's CDN, or as which cache status.
   * `x-vercel-cache: STALE` with reason `Tag-based invalidation` is only
   * visible in a runtime log on a deployed store after a real save. A source
   * reading is not evidence, and neither is a green run here.
   */
  describe("purge semantics split by blast radius", () => {
    beforeEach(() => {
      process.env.REVALIDATION_SECRET = SECRET;
    });

    it("invalidates the wide class and deletes the narrow class, in one mixed payload", async () => {
      const { POST } = await loadRoute();
      const res = await POST(
        post({
          secret: SECRET,
          tags: [
            // wide — whole catalogue / whole route family
            "headkit:products",
            "headkit:catalog",
            "headkit:catalog:cat:bikes",
            "headkit:route:home",
            "headkit:collections",
            // wide — root-layout CHROME, on every CDN entry by construction
            "headkit:branding",
            "headkit:footer",
            "headkit:menu:PRIMARY",
            "headkit:email-marketing",
            "headkit:settings",
            // narrow — one page or one index, checked right after a save
            "headkit:page:about",
            "headkit:pages",
            "headkit:post:mid-year-sale",
          ],
        }),
      );
      expect(res.status).toBe(200);

      // ONE array call for the whole wide set — not one call per tag.
      expect(invalidateByTag).toHaveBeenCalledTimes(1);
      expect(invalidateByTag).toHaveBeenCalledWith([
        "headkit:products",
        "headkit:catalog",
        "headkit:catalog:cat:bikes",
        "headkit:route:home",
        "headkit:collections",
        "headkit:branding",
        "headkit:footer",
        "headkit:menu:PRIMARY",
        "headkit:email-marketing",
        "headkit:settings",
      ]);

      // …and the narrow class still deletes, so the editor's next load is
      // guaranteed fresh. No wide tag may appear here. This list is the
      // POSITIVE CONTROL for the chrome classification: a change that widened
      // everything would satisfy the assertion above and fail this one.
      const deleted = new Map(
        revalidateTag.mock.calls.map((c) => [c[0] as string, c[1]]),
      );
      for (const narrow of [
        "headkit:page:about",
        "headkit:pages",
        "headkit:post:mid-year-sale",
      ]) {
        expect(deleted.get(narrow)).toEqual({ expire: 0 });
      }
      expect(deleted.size).toBe(3);
    });

    /**
     * The five root-layout chrome tags, through the REAL classifier and the
     * REAL route, asserted on `outcomes` — the field the live log carries.
     *
     * `invalidatesManyPages` is NOT mocked in this file, so this drives the
     * production classifier. What it cannot see: `@vercel/functions` is mocked,
     * so a green run says the route CALLED the purge API, never that the CDN
     * answered `x-vercel-cache: STALE` / "Tag-based invalidation".
     */
    it("routes every root-layout chrome tag through invalidateByTag and reports class wide", async () => {
      const CHROME = [
        "headkit:branding",
        "headkit:footer",
        "headkit:menu:PRIMARY",
        "headkit:menu:FOOTER_POLICY",
        "headkit:email-marketing",
        "headkit:settings",
      ];
      const { POST } = await loadRoute();
      const res = await POST(
        post({
          secret: SECRET,
          // The narrow control rides in the same payload, so "everything is
          // wide now" cannot pass this test.
          tags: [...CHROME, "headkit:page:about"],
        }),
      );
      expect(res.status).toBe(200);

      expect(invalidateByTag).toHaveBeenCalledTimes(1);
      expect(invalidateByTag).toHaveBeenCalledWith(CHROME);
      // The one narrow tag is the ONLY deletion.
      expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual([
        "headkit:page:about",
      ]);

      const logged = loggerInfo.mock.calls.find(
        (c) => c[0] === "revalidate",
      )?.[1] as {
        purgeApi: boolean;
        outcomes: { tag: string; class: string; mechanism: string }[];
      };
      expect(logged.purgeApi).toBe(true);
      const byTag = new Map(logged.outcomes.map((o) => [o.tag, o]));
      for (const tag of CHROME) {
        expect(
          byTag.get(tag),
          `${tag} is carried by a read app/layout.tsx awaits; reported as narrow it DELETES every prerendered page on the store`,
        ).toMatchObject({
          class: "wide",
          mechanism: "invalidateByTag",
          ok: true,
        });
      }
      expect(byTag.get("headkit:page:about")).toMatchObject({
        class: "narrow",
        mechanism: "revalidateTag",
        ok: true,
      });
    });

    it("does not call the purge API at all for a narrow-only payload", async () => {
      const { POST } = await loadRoute();
      await POST(
        post({
          secret: SECRET,
          tags: ["headkit:page:about", "headkit:post:mid-year-sale"],
        }),
      );
      expect(invalidateByTag).not.toHaveBeenCalled();
      expect(revalidateTag).toHaveBeenCalledTimes(2);
    });

    /**
     * The fallback, in both of its directions. This is the half that makes the
     * change safe to ship: degrading to a DELETION costs the first visitor of
     * each affected page a cold render and stays correct, while degrading to
     * NOTHING leaves the content stale with no error and no log line. Fail
     * towards slow, never towards wrong.
     */
    describe("fallback", () => {
      it("deletes wide tags when the runtime injected NO purge API", async () => {
        hasPurgeApi.mockReturnValue(false);
        const { POST } = await loadRoute();
        const res = await POST(
          post({
            secret: SECRET,
            tags: ["headkit:products", "headkit:page:about"],
          }),
        );
        expect(res.status).toBe(200);
        // The call is not even attempted — `invalidateByTag` resolves silently
        // with no context, so attempting it would look identical to success.
        // This is also what keeps the whole path inert off Vercel.
        expect(invalidateByTag).not.toHaveBeenCalled();
        expect(revalidateTag).toHaveBeenCalledWith("headkit:products", {
          expire: 0,
        });
        expect(loggerInfo).toHaveBeenCalledWith(
          "revalidate",
          expect.objectContaining({
            purgeApi: false,
            purgeFallback: "no-purge-api",
          }),
        );
      });

      it("deletes wide tags when the purge call REJECTS, and still answers 200", async () => {
        invalidateByTag.mockRejectedValue(new Error("purge unavailable"));
        const { POST } = await loadRoute();
        const res = await POST(
          post({
            secret: SECRET,
            tags: ["headkit:products", "headkit:catalog"],
          }),
        );
        // A failed purge must not fail the webhook — WordPress would retry the
        // whole payload, and the content is already correct at the origin.
        expect(res.status).toBe(200);
        expect(invalidateByTag).toHaveBeenCalledTimes(1);
        expect(revalidateTag).toHaveBeenCalledWith("headkit:products", {
          expire: 0,
        });
        expect(revalidateTag).toHaveBeenCalledWith("headkit:catalog", {
          expire: 0,
        });
        // The rejection is logged with the tag list, never the raw error body.
        expect(loggerError).toHaveBeenCalledWith(
          "revalidate.invalidate_by_tag_failed",
          expect.objectContaining({
            name: "Error",
            tags: ["headkit:products", "headkit:catalog"],
          }),
        );
        // …and the failure stays visible in `outcomes` AFTER the recovery: a
        // failed `invalidateByTag` row beside the `revalidateTag` row that
        // actually purged it, rather than one averaged row that reads as fine.
        const logged = loggerInfo.mock.calls.find(
          (c) => c[0] === "revalidate",
        )?.[1] as { outcomes: unknown[]; purgeFallback: string };
        expect(logged.purgeFallback).toBe("rejected");
        expect(logged.outcomes).toEqual(
          expect.arrayContaining([
            {
              tag: "headkit:products",
              class: "wide",
              mechanism: "invalidateByTag",
              ok: false,
            },
            {
              tag: "headkit:products",
              class: "wide",
              mechanism: "revalidateTag",
              ok: true,
            },
          ]),
        );
      });
    });

    /**
     * The path half, which had to ship in the same change. `revalidatePath` has
     * no lifetime parameter anywhere in `next/cache` — it is an unconditional
     * delete — so without this the wide invalidate above is defeated one line
     * later on every page that appears in a `paths` array, silently, while the
     * log says the invalidate fired.
     */
    describe("path classification", () => {
      it("skips a path a tag in the SAME payload covers, and purges an uncovered one", async () => {
        const { POST } = await loadRoute();
        const res = await POST(
          post({
            secret: SECRET,
            tags: [
              "headkit:catalog:cat:helmets",
              "headkit:product:mountain-bike-helmet",
            ],
            paths: [
              "/collections/helmets", // covered by the wide grid tag
              "/products/mountain-bike-helmet", // covered by the narrow tag
              "/collections/gloves", // NOT covered — must still be purged
            ],
          }),
        );
        expect(res.status).toBe(200);

        expect(revalidatePath).toHaveBeenCalledTimes(1);
        expect(revalidatePath).toHaveBeenCalledWith("/collections/gloves");
        expect(loggerInfo).toHaveBeenCalledWith(
          "revalidate",
          expect.objectContaining({
            skippedPaths: [
              "/collections/helmets",
              "/products/mountain-bike-helmet",
            ],
          }),
        );
      });

      it("still purges every path when the payload carries no tags at all", async () => {
        const { POST } = await loadRoute();
        await POST(
          post({ secret: SECRET, paths: ["/collections/helmets", "/about"] }),
        );
        expect(revalidatePath).toHaveBeenCalledWith("/collections/helmets");
        expect(revalidatePath).toHaveBeenCalledWith("/about");
      });

      it("does not let a DROPPED tag cover a path", async () => {
        // A tag the allowlist rejected purged nothing, so it can cover nothing.
        // The coverage check therefore runs against the FILTERED tag list.
        const { POST } = await loadRoute();
        await POST(
          post({
            secret: SECRET,
            tags: ["headkit:totally-unknown"],
            paths: ["/totally-unknown"],
          }),
        );
        expect(revalidatePath).toHaveBeenCalledWith("/totally-unknown");
      });
    });

    it("splits a whole wp-admin product-save payload without changing WHICH tags are purged", async () => {
      // The shape a stock edit produces: the product entity tag, the grid and
      // collection tags for each category and its ancestors, the brand
      // product-set tag, and the blanket listing tags.
      const PAYLOAD_TAGS = [
        "headkit:product:road-bike",
        "headkit:catalog:cat:bikes",
        "headkit:collection:bikes",
        "headkit:catalog:cat:road-bikes",
        "headkit:collection:road-bikes",
        "headkit:brand:acme",
        "headkit:route:new",
        "headkit:route:home",
        "headkit:products",
        "headkit:route:shop",
      ];
      const WIDE = [
        "headkit:catalog:cat:bikes",
        "headkit:catalog:cat:road-bikes",
        "headkit:route:new",
        "headkit:route:home",
        "headkit:products",
        "headkit:route:shop",
      ];
      const NARROW = PAYLOAD_TAGS.filter((t) => !WIDE.includes(t));

      const { POST } = await loadRoute();
      const res = await POST(post({ secret: SECRET, tags: PAYLOAD_TAGS }));
      expect(res.status).toBe(200);

      // Nothing is dropped and nothing is added — the split must not change
      // WHICH tags are purged, only how.
      expect(invalidateByTag).toHaveBeenCalledTimes(1);
      const invalidated = invalidateByTag.mock.calls[0]?.[0] as string[];
      const deleted = revalidateTag.mock.calls.map((c) => c[0] as string);
      expect(invalidated).toEqual(WIDE);
      expect(deleted).toEqual(NARROW);
      expect([...invalidated, ...deleted].sort()).toEqual(
        [...PAYLOAD_TAGS].sort(),
      );
      await expect(res.json()).resolves.toMatchObject({
        count: PAYLOAD_TAGS.length,
      });

      // The edited product, its collection entities and its brand still DELETE,
      // so the merchandiser reloading that PDP sees the new stock at once — the
      // editor-immediacy rule, unchanged.
      for (const call of revalidateTag.mock.calls) {
        expect(call[1]).toEqual({ expire: 0 });
      }

      // Every tag appears exactly once in `outcomes`, with the branch that
      // fired for it. No purge landed twice and none went unrecorded.
      const logged = loggerInfo.mock.calls.find(
        (c) => c[0] === "revalidate",
      )?.[1] as {
        purgeApi: boolean;
        outcomes: { tag: string; class: string; mechanism: string }[];
        skippedPaths: string[];
      };
      expect(logged.purgeApi).toBe(true);
      expect(logged.skippedPaths).toEqual([]);
      expect(logged.outcomes).toHaveLength(PAYLOAD_TAGS.length);
      const byTag = new Map(logged.outcomes.map((o) => [o.tag, o]));
      for (const tag of WIDE) {
        expect(byTag.get(tag)).toMatchObject({
          class: "wide",
          mechanism: "invalidateByTag",
          ok: true,
        });
      }
      for (const tag of NARROW) {
        expect(byTag.get(tag)).toMatchObject({
          class: "narrow",
          mechanism: "revalidateTag",
          ok: true,
        });
      }
    });
  });
});
