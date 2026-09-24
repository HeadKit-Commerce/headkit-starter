/**
 * `/sitemap.xml` carries a CDN-cacheable `Cache-Control`, set from
 * `next.config.ts` `headers()` because a metadata route cannot set its own
 * response headers.
 *
 * DOMAIN: the config entry and its exact value. Whether Vercel's CDN then
 * answers HIT is observable only against a deployed response, and is not
 * asserted here.
 */
import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("the sitemap's CDN cache header", () => {
  it("sets public, s-maxage=3600, stale-while-revalidate=86400 on exactly /sitemap.xml", async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/sitemap.xml");
    expect(
      rule,
      "next.config.ts has no /sitemap.xml headers entry",
    ).toBeDefined();
    const cacheControl = rule!.headers.find(
      (h) => h.key.toLowerCase() === "cache-control",
    );
    // The hour is deliberate and is the cost of the change: a tag purge drops
    // the cached ENTRY behind the route, never the CDN copy, so the sitemap
    // can be an hour behind a purge. Changing this number is changing that
    // window for every store.
    expect(cacheControl?.value).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("leaves the site-wide security headers rule first", async () => {
    const rules = await nextConfig.headers!();
    const securityIndex = rules.findIndex((r) => r.source === "/(.*)");
    const sitemapIndex = rules.findIndex((r) => r.source === "/sitemap.xml");
    expect(securityIndex).toBeGreaterThanOrEqual(0);
    expect(sitemapIndex).toBeGreaterThan(securityIndex);
  });

  it("caps the sitemap rule to that one path", async () => {
    // A `/(.*)`-shaped source here would put an hour of CDN cache on every
    // shopper-facing route, which is emphatically not the trade being made.
    const rules = await nextConfig.headers!();
    const cacheRules = rules.filter((r) =>
      r.headers.some((h) => h.key.toLowerCase() === "cache-control"),
    );
    expect(cacheRules.map((r) => r.source)).toEqual(["/sitemap.xml"]);
  });
});
