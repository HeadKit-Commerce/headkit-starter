import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Maintenance gate (cutover gate G6) — `lib/maintenance.ts`.
 *
 * Proves the contract the runbook depends on:
 *   - flag ON  → 503 + `Retry-After` + the branded page, never 200
 *   - flag OFF → pass-through
 *   - one key PER HOST, so a flip cannot darken the fleet
 *   - every exemption still answers with the flag ON, and the non-exemptions
 *     do not
 *   - operator bypass works with the flag on, and fails without the secret
 *   - the fail path: unreadable + never-seen-dark → up; unreadable + seen-dark
 *     → dark
 *
 * `@vercel/edge-config` is mocked (the SDK's own network path is Vercel's to
 * test); everything else runs real. The end-to-end proof against a live Edge
 * Config endpoint — including that a flip needs no redeploy — is
 * `scripts/smoke/maintenance-gate.sh`.
 */

const { edgeConfigGet, createClient } = vi.hoisted(() => {
  const get = vi.fn();
  return {
    edgeConfigGet: get,
    createClient: vi.fn((connection?: string) => {
      // Mirrors the SDK: an unusable connection string throws rather than
      // returning a client that silently reads nothing.
      if (!connection || !connection.startsWith("http")) {
        throw new Error("Invalid connection string provided");
      }
      return { get };
    }),
  };
});
vi.mock("@vercel/global-config", () => ({ createClient }));

import {
  INDEXNOW_KEY_FILE,
  isMaintenanceExempt,
  maintenanceGate,
  maintenanceKeyForHost,
  normalizeFlag,
  renderMaintenancePage,
  requestHost,
  resetMaintenanceMemoForTests,
} from "@/lib/maintenance";

const BYPASS_SECRET = "s3cret-operator-bypass-value";

function req(
  path: string,
  init?: { host?: string; cookie?: string; forwardedHost?: string },
): NextRequest {
  const host = init?.host ?? "www.dishee.com.au";
  const headers = new Headers({ host });
  if (init?.forwardedHost) headers.set("x-forwarded-host", init.forwardedHost);
  if (init?.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, `https://${host}`), { headers });
}

const CONNECTION = "https://global-config.vercel.com/ecfg_test?token=t";

beforeEach(() => {
  resetMaintenanceMemoForTests();
  edgeConfigGet.mockReset();
  createClient.mockClear();
  delete process.env.EDGE_CONFIG;
  process.env.GLOBAL_CONFIG = CONNECTION;
  process.env.MAINTENANCE_BYPASS_SECRET = BYPASS_SECRET;
});

afterEach(() => {
  delete process.env.GLOBAL_CONFIG;
  delete process.env.EDGE_CONFIG;
  delete process.env.MAINTENANCE_BYPASS_SECRET;
});

describe("key derivation", () => {
  it("scopes the key to the host so one store goes dark alone", () => {
    expect(maintenanceKeyForHost("www.dishee.com.au")).toBe(
      "maintenance_www_dishee_com_au",
    );
    expect(maintenanceKeyForHost("dishee-rehearsal.vercel.app")).toBe(
      "maintenance_dishee_rehearsal_vercel_app",
    );
    // Two stores never collide on one key.
    expect(maintenanceKeyForHost("www.pebblr.com.au")).not.toBe(
      maintenanceKeyForHost("www.dishee.com.au"),
    );
    // No host still produces a namespaced key, never a bare root boolean.
    expect(maintenanceKeyForHost("")).toBe("maintenance");
  });

  it("reads the shopper-facing host, port-stripped", () => {
    expect(requestHost(req("/", { host: "localhost:3111" }))).toBe("localhost");
    expect(
      requestHost(
        req("/", { host: "internal", forwardedHost: "WWW.Dishee.com.AU" }),
      ),
    ).toBe("www.dishee.com.au");
  });
});

describe("flag normalisation", () => {
  it("accepts a bare boolean and an object", () => {
    expect(normalizeFlag(true)).toEqual({
      enabled: true,
      retryAfterSeconds: 3600,
    });
    expect(normalizeFlag({ enabled: true, retryAfterSeconds: 900 })).toEqual({
      enabled: true,
      retryAfterSeconds: 900,
    });
    expect(
      normalizeFlag({ enabled: true, headline: "H", message: "M" }),
    ).toMatchObject({ headline: "H", message: "M" });
  });

  it("reads anything unexpected as OFF rather than darkening a store", () => {
    for (const value of [
      undefined,
      null,
      false,
      "true",
      1,
      [],
      { enabled: "true" },
      { enabled: false },
    ]) {
      expect(normalizeFlag(value).enabled).toBe(false);
    }
  });

  it("ignores a nonsense Retry-After instead of emitting one", () => {
    expect(
      normalizeFlag({ enabled: true, retryAfterSeconds: -5 }).retryAfterSeconds,
    ).toBe(3600);
    expect(
      normalizeFlag({ enabled: true, retryAfterSeconds: "soon" })
        .retryAfterSeconds,
    ).toBe(3600);
  });
});

describe("exemptions", () => {
  it("keeps the paths a window depends on answering", () => {
    for (const path of [
      "/api/revalidate",
      "/api/checkout/confirm",
      // Its only redirect target — exempting the handler alone would 303 a
      // shopper holding a charged card straight into the maintenance page.
      "/checkout/finalising",
      "/api/posts-base-path",
      "/api/indexnow-key",
      "/robots.txt",
      "/_next/static/chunk.js",
      "/_vercel/insights/event",
      "/abcdef1234567890.txt",
    ]) {
      expect(isMaintenanceExempt(path), path).toBe(true);
    }
  });

  it("gates shopper paths and anything that mutates a live session", () => {
    for (const path of [
      "/",
      "/products/wool-beanie",
      "/collections/sale",
      "/checkout",
      "/account/orders",
      "/api/checkout/sync-line-items",
      "/api/icon",
      "/api/branding-font",
    ]) {
      expect(isMaintenanceExempt(path), path).toBe(false);
    }
  });
});

describe("arming", () => {
  /**
   * The variable name is the whole ballgame: read the wrong one and the gate
   * takes the unarmed branch on every request forever, silently and openly.
   * Vercel injects GLOBAL_CONFIG today (verified on headkit-starter-staging,
   * 2026-08-25); EDGE_CONFIG is the pre-rename name still present on older
   * projects. Both must arm it, and whichever is resolved must be the string
   * the client is actually built from.
   */
  it("arms on GLOBAL_CONFIG, the name Vercel injects today", async () => {
    edgeConfigGet.mockResolvedValue(true);
    expect((await maintenanceGate(req("/"))).response?.status).toBe(503);
    expect(createClient).toHaveBeenCalledWith(CONNECTION);
  });

  it("arms on EDGE_CONFIG, the pre-rename name", async () => {
    delete process.env.GLOBAL_CONFIG;
    process.env.EDGE_CONFIG = "https://edge-config.vercel.com/ecfg_old?token=t";
    edgeConfigGet.mockResolvedValue(true);
    expect((await maintenanceGate(req("/"))).response?.status).toBe(503);
    expect(createClient).toHaveBeenCalledWith(
      "https://edge-config.vercel.com/ecfg_old?token=t",
    );
  });

  it("prefers GLOBAL_CONFIG when both are set, and reads through that one", async () => {
    process.env.EDGE_CONFIG = "https://edge-config.vercel.com/ecfg_old?token=t";
    edgeConfigGet.mockResolvedValue(true);
    await maintenanceGate(req("/"));
    expect(createClient).toHaveBeenCalledWith(CONNECTION);
  });

  it("reports an unusable connection string instead of failing silently", async () => {
    process.env.GLOBAL_CONFIG = "not-a-connection-string";
    const result = await maintenanceGate(req("/"));
    expect(result.response).toBeNull();
    expect(result.state).toBe("unarmed:invalid-connection");
    expect(edgeConfigGet).not.toHaveBeenCalled();
  });
});

describe("the gate", () => {
  it("is completely inert with no config store connected", async () => {
    delete process.env.GLOBAL_CONFIG;
    delete process.env.EDGE_CONFIG;
    const result = await maintenanceGate(req("/"));
    expect(result.response).toBeNull();
    expect(result.key).toBeNull();
    expect(result.state).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(edgeConfigGet).not.toHaveBeenCalled();
  });

  it("passes through when the host has no entry — the normal case", async () => {
    edgeConfigGet.mockResolvedValue(undefined);
    const result = await maintenanceGate(req("/"));
    expect(result.response).toBeNull();
    expect(result.key).toBe("maintenance_www_dishee_com_au");
    expect(edgeConfigGet).toHaveBeenCalledWith(
      "maintenance_www_dishee_com_au",
      { consistentRead: true },
    );
  });

  it("serves 503 + Retry-After + the branded page, never 200", async () => {
    edgeConfigGet.mockResolvedValue({ enabled: true, retryAfterSeconds: 900 });
    const { response } = await maintenanceGate(req("/products/wool-beanie"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("900");
    expect(response?.headers.get("Cache-Control")).toBe(
      "no-store, must-revalidate",
    );
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response?.headers.get("x-hk-maintenance-key")).toBe(
      "maintenance_www_dishee_com_au",
    );
    const body = await response?.text();
    expect(body).toContain("<!doctype html>");
    expect(body).toContain('name="robots"');
    // Self-contained: nothing to fetch while the backend is being migrated.
    expect(body).not.toMatch(/<script|<link |https?:\/\//);
  });

  it("reads only its own host's key, so one flip cannot darken the fleet", async () => {
    edgeConfigGet.mockImplementation(async (key: string) =>
      key === "maintenance_www_dishee_com_au" ? true : undefined,
    );
    expect(
      (await maintenanceGate(req("/", { host: "www.dishee.com.au" }))).response
        ?.status,
    ).toBe(503);
    expect(
      (await maintenanceGate(req("/", { host: "www.pebblr.com.au" }))).response,
    ).toBeNull();
  });

  it("answers every exemption with the flag ON, without reading the flag", async () => {
    edgeConfigGet.mockResolvedValue(true);
    for (const path of [
      "/api/revalidate",
      "/api/checkout/confirm",
      "/api/posts-base-path",
      "/robots.txt",
    ]) {
      const { response } = await maintenanceGate(req(path));
      expect(response, path).toBeNull();
    }
    expect(edgeConfigGet).not.toHaveBeenCalled();
  });

  it("does not read the flag before deciding — the API is never on the path", async () => {
    edgeConfigGet.mockResolvedValue(true);
    await maintenanceGate(req("/"));
    expect(edgeConfigGet).toHaveBeenCalledTimes(1);
  });
});

describe("operator bypass", () => {
  it("grants a cookie for the right secret and strips it from the URL", async () => {
    edgeConfigGet.mockResolvedValue(true);
    const { response } = await maintenanceGate(
      req(`/?hk-maintenance-bypass=${encodeURIComponent(BYPASS_SECRET)}`),
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://www.dishee.com.au/",
    );
    const cookie = response?.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("hk-maintenance-bypass=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("lets a holder of the cookie through while the store is dark", async () => {
    edgeConfigGet.mockResolvedValue(true);
    const { response } = await maintenanceGate(
      req("/checkout", {
        cookie: `hk-maintenance-bypass=${BYPASS_SECRET}`,
      }),
    );
    expect(response).toBeNull();
  });

  it("refuses a wrong secret, in the query and in the cookie", async () => {
    edgeConfigGet.mockResolvedValue(true);
    expect(
      (await maintenanceGate(req("/?hk-maintenance-bypass=wrong"))).response
        ?.status,
    ).toBe(503);
    expect(
      (
        await maintenanceGate(
          req("/", { cookie: "hk-maintenance-bypass=wrong" }),
        )
      ).response?.status,
    ).toBe(503);
  });

  it("does not exist at all when no secret is configured", async () => {
    delete process.env.MAINTENANCE_BYPASS_SECRET;
    edgeConfigGet.mockResolvedValue(true);
    expect(
      (await maintenanceGate(req("/", { cookie: "hk-maintenance-bypass=" })))
        .response?.status,
    ).toBe(503);
    expect(
      (await maintenanceGate(req("/?hk-maintenance-bypass="))).response?.status,
    ).toBe(503);
  });

  it("refuses a secret too short to be worth anything", async () => {
    process.env.MAINTENANCE_BYPASS_SECRET = "short";
    edgeConfigGet.mockResolvedValue(true);
    const { response } = await maintenanceGate(
      req("/", { cookie: "hk-maintenance-bypass=short" }),
    );
    expect(response?.status).toBe(503);
  });
});

describe("the fail path", () => {
  it("keeps a store that was never dark UP when the read fails", async () => {
    edgeConfigGet.mockRejectedValue(new Error("Edge Config not found"));
    const { response } = await maintenanceGate(req("/"));
    expect(response).toBeNull();
  });

  it("keeps a store that IS dark dark when the read then fails", async () => {
    edgeConfigGet.mockResolvedValueOnce(true);
    expect((await maintenanceGate(req("/"))).response?.status).toBe(503);

    edgeConfigGet.mockRejectedValue(new Error("network"));
    const { response } = await maintenanceGate(req("/"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("3600");
  });

  it("keeps the window's own copy and Retry-After through a read failure", async () => {
    edgeConfigGet.mockResolvedValueOnce({
      enabled: true,
      retryAfterSeconds: 900,
      headline: "We're upgrading",
      message: "Back around 7pm AEST.",
    });
    await maintenanceGate(req("/"));

    edgeConfigGet.mockRejectedValue(new Error("network"));
    const { response } = await maintenanceGate(req("/"));
    expect(response?.headers.get("Retry-After")).toBe("900");
    const body = await response?.text();
    expect(body).toContain("We&#39;re upgrading");
    expect(body).toContain("Back around 7pm AEST.");
  });

  it("says from outside whether a 503 came from the flag or the fail path", async () => {
    edgeConfigGet.mockResolvedValueOnce(true);
    expect(
      (await maintenanceGate(req("/"))).response?.headers.get(
        "x-hk-maintenance",
      ),
    ).toBe("flag");

    edgeConfigGet.mockRejectedValue(new Error("network"));
    expect(
      (await maintenanceGate(req("/"))).response?.headers.get(
        "x-hk-maintenance",
      ),
    ).toMatch(/^fail-closed:/);
  });

  it("lets a lifted store come back up even if the read then fails", async () => {
    edgeConfigGet.mockResolvedValueOnce(true);
    await maintenanceGate(req("/"));
    edgeConfigGet.mockResolvedValueOnce(false);
    await maintenanceGate(req("/"));

    edgeConfigGet.mockRejectedValue(new Error("network"));
    expect((await maintenanceGate(req("/"))).response).toBeNull();
  });

  it("does not leak the store id or SDK message to a shopper", async () => {
    edgeConfigGet.mockResolvedValueOnce(true);
    await maintenanceGate(req("/"));
    edgeConfigGet.mockRejectedValue(
      new Error("@vercel/edge-config: Edge Config ecfg_secret not found"),
    );
    const body = await (await maintenanceGate(req("/"))).response?.text();
    expect(body).not.toContain("ecfg_");
  });
});

describe("the IndexNow pattern", () => {
  /**
   * `proxy.ts` rewrites ownership files using this exact exported regex, and the
   * gate exempts them using the same one. The invariant that matters is that
   * the two agree for every path: anything the rewrite claims must survive the
   * gate, or the store silently 503s the file it is rewriting.
   */
  it("exempts exactly the paths the rewrite claims", () => {
    for (const path of [
      "/abcdef1234567890.txt",
      "/a1b2c3d4.txt",
      "/short.txt",
      "/robots.txt",
      "/has_underscore_here.txt",
      "/nested/abcdef1234567890.txt",
      "/abcdef1234567890.xml",
    ]) {
      const rewritten = INDEXNOW_KEY_FILE.exec(path) !== null;
      if (rewritten) expect(isMaintenanceExempt(path), path).toBe(true);
    }
    // And the capture the rewrite depends on is still group 1.
    expect(INDEXNOW_KEY_FILE.exec("/abcdef1234567890.txt")?.[1]).toBe(
      "abcdef1234567890",
    );
  });
});

describe("the page", () => {
  it("escapes copy supplied per-window rather than rendering it as markup", () => {
    const html = renderMaintenancePage({
      enabled: true,
      retryAfterSeconds: 60,
      headline: "<script>alert(1)</script>",
      message: "Back at 5pm & later",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Back at 5pm &amp; later");
  });
});
