import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "node:crypto";

/**
 * Cache-revalidation edit→surface acceptance (Phase 09.5, CACHE-02/03/04/05/06).
 *
 * Guards the storefront's observable, dual-auth `/api/revalidate` webhook and the
 * realigned chrome/home cache-tag subscriptions end-to-end against the LOCAL
 * Docker stack: a signed (HMAC) or legacy body-secret revalidate for a menu edit
 * and a home/carousel edit must (a) authenticate, (b) resolve to the CONTRACT
 * tags the components subscribe to with `dropped:0`, and (c) leave the surface
 * rendering — while a PRE-FIX vocabulary tag (`headkit:navigation` /
 * `headkit:homepage`) is dropped and revalidates nothing (the drift bug).
 *
 * This is the automatable slice of gates V3 (drift repro) + the CACHE-04/05
 * menu/home edit→surface. The cross-instance island durability question (V1) and
 * the origin-storm measurement (V2) are manual local-Docker gates recorded in
 * 09.5-08-SUMMARY.md — they need a two-worker topology Playwright can't model.
 *
 * LOCAL-ONLY (HARD RULE): baseURL is the local Docker starter (:3000 by default,
 * or E2E_BASE_URL). No staging/prod host may appear here. The full WP/Go/Hive/
 * Next stack must be up out-of-band (see playwright.config.ts — no webServer).
 *
 * Auth: the signed path needs the storefront's REVALIDATION_SECRET. When it is
 * exported to the test env (process.env.REVALIDATION_SECRET) the auth-gated
 * edit→surface assertions run; otherwise they are skipped (the route is
 * fail-closed 503 without a secret, which the health probe detects) so the
 * surface-render assertions still execute in a bare env.
 */

const SECRET = process.env.REVALIDATION_SECRET ?? "";

/** Sign a body exactly as WP sign-at-send / route.ts verify (09.5-02/07). */
function hmacHeaders(rawBody: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}.`)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
  return { "x-hk-signature": sig, "x-hk-timestamp": ts };
}

/** POST a signed revalidate; returns the parsed JSON envelope + status. */
async function postSignedRevalidate(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ status: number; json: RevalidateResponse }> {
  const raw = JSON.stringify(body);
  const res = await request.post("/api/revalidate", {
    headers: { "content-type": "application/json", ...hmacHeaders(raw) },
    data: raw,
  });
  return {
    status: res.status(),
    json: (await res.json()) as RevalidateResponse,
  };
}

interface RevalidateResponse {
  requestId: string;
  revalidated?: string[];
  paths?: string[];
  count?: number;
  error?: string;
}

/** True when the route reports a secret is configured (GET health check). */
async function secretConfigured(request: APIRequestContext): Promise<boolean> {
  const res = await request.get("/api/revalidate");
  if (res.status() !== 200) return false;
  const body = (await res.json()) as { configured?: boolean };
  return body.configured === true && SECRET.length > 0;
}

test.describe("Cache revalidation edit→surface (V3 drift + CACHE-04/05)", () => {
  test("menu edit→surface: signed menu:PRIMARY revalidates the contract tag (dropped:0) and the nav still renders", async ({
    page,
    request,
  }) => {
    // Surface renders before the edit (the request-time menu island is wired).
    await page.goto("/");
    await expect(
      page.locator("nav").first(),
      "primary navigation did not render on the home shell",
    ).toBeVisible();

    test.skip(
      !(await secretConfigured(request)),
      "REVALIDATION_SECRET not exported to the test env — auth-gated edit→surface skipped (route is fail-closed 503).",
    );

    // A menu edit fires ONLY the by-location chrome tag (never a route/page tag).
    const { status, json } = await postSignedRevalidate(request, {
      tags: ["headkit:menu:PRIMARY"],
      action: "menu",
    });
    expect(status, "signed menu revalidate was not authorized").toBe(200);
    expect(
      json.revalidated,
      "menu:PRIMARY did not reach revalidateTag — the nav would go stale",
    ).toContain("headkit:menu:PRIMARY");
    // dropped:0 ⇔ every sent tag is a known contract tag (no residual drift).
    expect(
      json.count,
      "unexpected extra/dropped tags for a clean menu edit",
    ).toBe(1);

    // Post-revalidation the nav island still renders (invalidation didn't break it).
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("home edit→surface: signed route:home + module:carousel revalidate the home union (dropped:0) and home still renders", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("main, body").first(),
      "home did not render",
    ).toBeVisible();

    test.skip(
      !(await secretConfigured(request)),
      "REVALIDATION_SECRET not exported to the test env — auth-gated edit→surface skipped.",
    );

    // A carousel/hero edit fires its module tag + the home route tag (D7 union).
    const { status, json } = await postSignedRevalidate(request, {
      tags: ["headkit:route:home", "headkit:module:carousel"],
      action: "carousel",
    });
    expect(status).toBe(200);
    expect(json.revalidated).toEqual(
      expect.arrayContaining(["headkit:route:home", "headkit:module:carousel"]),
    );
    expect(
      json.count,
      "home union edit should map to exactly 2 contract tags",
    ).toBe(2);

    await page.goto("/");
    await expect(page.locator("main, body").first()).toBeVisible();
  });

  test("drift guard: PRE-FIX vocabulary (headkit:navigation/homepage) is dropped and revalidates nothing", async ({
    request,
  }) => {
    test.skip(
      !(await secretConfigured(request)),
      "REVALIDATION_SECRET not exported to the test env — drift guard skipped.",
    );

    // The exact tags the OLD storefront subscribed to. They are NOT contract tags,
    // so the route drops them: revalidated:[] ⇒ the edit would NOT surface. This
    // reproduces the silent under-invalidation drift the phase fixes.
    const { status, json } = await postSignedRevalidate(request, {
      tags: ["headkit:navigation", "headkit:homepage"],
      action: "menu",
    });
    expect(
      status,
      "auth itself must still succeed — only the tags are stale-vocab",
    ).toBe(200);
    expect(
      json.revalidated,
      "a pre-fix vocabulary tag must NOT reach revalidateTag (drift proof)",
    ).toEqual([]);
    expect(json.count).toBe(0);
  });

  test("legacy body-secret path (dual-auth transition) still authorizes a footer edit", async ({
    request,
  }) => {
    test.skip(
      !(await secretConfigured(request)),
      "REVALIDATION_SECRET not exported to the test env — dual-auth check skipped.",
    );

    // No HMAC headers — the legacy body-secret branch (kept until every store's
    // WP emits HMAC) must still authorize and revalidate the footer chrome tag.
    const raw = JSON.stringify({
      secret: SECRET,
      tag: "headkit:footer",
      action: "footer",
    });
    const res = await request.post("/api/revalidate", {
      headers: { "content-type": "application/json" },
      data: raw,
    });
    expect(res.status(), "legacy body-secret was not accepted").toBe(200);
    const json = (await res.json()) as RevalidateResponse;
    expect(json.revalidated).toContain("headkit:footer");
  });
});
