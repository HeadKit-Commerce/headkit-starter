import { describe, expect, it } from "vitest";
import {
  parseRobotsTxt,
  patternMatches,
  robotsVerdict,
  ROBOTS_ABSENT,
} from "./robots-txt";

describe("robots.txt parsing", () => {
  it("reads groups, rules and sitemap lines", () => {
    const robots = parseRobotsTxt(`
# a comment
User-agent: *
Disallow: /checkout
Allow: /

User-agent: Googlebot
Disallow: /

Sitemap: https://example.invalid/sitemap.xml
`);
    expect(robots.groups).toHaveLength(2);
    expect(robots.sitemaps).toEqual(["https://example.invalid/sitemap.xml"]);
  });

  it("treats consecutive user-agent lines as one group", () => {
    const robots = parseRobotsTxt(
      "User-agent: a\nUser-agent: b\nDisallow: /x\n",
    );
    expect(robots.groups).toHaveLength(1);
    expect(robots.groups[0]!.agents).toEqual(["a", "b"]);
  });
});

describe("robots.txt verdicts", () => {
  const disallowAll = parseRobotsTxt(
    "User-Agent: *\nDisallow: /\nHost: https://example.invalid\n",
  );

  it("reads the rehearsal-host posture as disallowed for every path", () => {
    // This is what both rehearsal storefronts serve today: `app/robots.ts`
    // short-circuits to disallowEverything() on a non-indexable host.
    expect(robotsVerdict(disallowAll, "/").allowed).toBe(false);
    expect(robotsVerdict(disallowAll, "/shop/a/b/c").allowed).toBe(false);
    expect(robotsVerdict(disallowAll, "/shop/a/b/c").rule).toBe("Disallow: /");
  });

  it("lets the longest match win, not the file order", () => {
    const robots = parseRobotsTxt(
      "User-agent: *\nDisallow: /\nAllow: /shop/\n",
    );
    expect(robotsVerdict(robots, "/shop/kettles").allowed).toBe(true);
    expect(robotsVerdict(robots, "/account").allowed).toBe(false);
  });

  it("prefers a named agent group over the wildcard group", () => {
    const robots = parseRobotsTxt(
      "User-agent: *\nAllow: /\n\nUser-agent: googlebot\nDisallow: /\n",
    );
    expect(robotsVerdict(robots, "/x", "Googlebot").allowed).toBe(false);
    expect(robotsVerdict(robots, "/x").allowed).toBe(true);
  });

  it("treats an absent robots.txt as allowing everything", () => {
    expect(robotsVerdict(ROBOTS_ABSENT, "/anything").allowed).toBe(true);
    expect(robotsVerdict(ROBOTS_ABSENT, "/anything").rule).toBeNull();
  });

  it("honours wildcards and the end anchor", () => {
    expect(patternMatches("/*.pdf$", "/a/b/c.pdf")).toBe(true);
    expect(patternMatches("/*.pdf$", "/a/b/c.pdf?x=1")).toBe(false);
    expect(patternMatches("/shop/*/kettles", "/shop/kitchen/kettles")).toBe(
      true,
    );
  });
});
