import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    DASHBOARD_API_URL: "https://dashboard.example/graphql/subgraph/headkit",
    DASHBOARD_API_TOKEN: "test-token",
  },
}));

import { getBranding } from "@/lib/branding";

/**
 * `storeSettings.webmcpEnabled` — the per-store WebMCP gate.
 *
 * THE CLAIM: absent means OFF, on every path by which "absent" can happen.
 *
 * Every store on the platform today has no value for this field, so the
 * default is what the whole fleet gets. If absent meant on, an in-page agent
 * could update the cart on stores whose merchants never asked for it. The
 * paths below are the ways the storefront can fail to learn the answer, and
 * they must all land on false.
 */

type GraphQLBody = { query: string };

function installFetch(
  webmcp:
    | { kind: "value"; enabled: boolean | null }
    | { kind: "status"; status: number }
    | { kind: "throw" },
): { queries: string[] } {
  const queries: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as GraphQLBody;
      queries.push(body.query);

      if (body.query.includes("webmcpEnabled")) {
        if (webmcp.kind === "throw") {
          throw new Error("dashboard-api unreachable");
        }
        if (webmcp.kind === "status") {
          return new Response("nope", { status: webmcp.status });
        }
        return Response.json({
          data: {
            storeSettings: { webmcpEnabled: webmcp.enabled },
          },
        });
      }

      return Response.json({
        data: {
          branding: { primaryColor: "#111111", secondaryColor: "#ffffff" },
          storeSettings: { id: "s1", slug: "shop", name: "Shop" },
          seoSettings: { title: "Shop", description: null, ogImageUrl: null },
        },
      });
    }),
  );

  return { queries };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("webmcpEnabled is off unless the merchant turned it on", () => {
  it("is false when dashboard-api answers null — the store that never set it", async () => {
    installFetch({ kind: "value", enabled: null });
    const bundle = await getBranding();
    expect(bundle.storeSettings.webmcpEnabled).toBe(false);
    expect(bundle.branding.primaryColor).toBe("#111111");
  });

  it("is false when dashboard-api does not know the field (non-200)", async () => {
    installFetch({ kind: "status", status: 400 });
    const bundle = await getBranding();
    expect(bundle.storeSettings.webmcpEnabled).toBe(false);
    expect(bundle.branding.primaryColor).toBe("#111111");
  });

  it("is false when the request throws", async () => {
    installFetch({ kind: "throw" });
    const bundle = await getBranding();
    expect(bundle.storeSettings.webmcpEnabled).toBe(false);
  });

  it("is true only when dashboard-api says true", async () => {
    installFetch({ kind: "value", enabled: true });
    const bundle = await getBranding();
    expect(bundle.storeSettings.webmcpEnabled).toBe(true);
    expect(bundle.branding.primaryColor).toBe("#111111");
  });
});

describe("the read stays isolated", () => {
  it("asks for webmcpEnabled in exactly one query, alone", async () => {
    const { queries } = installFetch({ kind: "value", enabled: true });
    await getBranding();

    const asking = queries.filter((q) => q.includes("webmcpEnabled"));
    expect(asking).toHaveLength(1);
    expect(asking[0]).not.toContain("primaryColor");
    expect(asking[0]).not.toContain("seoSettings");
    expect(asking[0]).not.toContain("cookieConsentEnabled");
  });
});
