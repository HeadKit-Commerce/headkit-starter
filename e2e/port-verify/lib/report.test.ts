import { describe, expect, it } from "vitest";
import { diffSignals } from "./diff";
import { renderReport } from "./report";
import type { CaptureEntry, CaptureRun } from "./types";
import { CAPTURE_SCHEMA_VERSION } from "./types";

const LIVE = "https://store.invalid";
const PREVIEW = "https://preview-abc123.vercel.app";

function entryFor(key: string, sweptBy: string): CaptureEntry {
  const baked = sweptBy === LIVE ? `{origin}${key}` : `${LIVE}${key}`;
  return {
    key,
    kind: "product",
    mode: "full",
    http: {
      chain: [{ url: `{origin}${key}`, status: 200, location: null }],
      finalUrl: `{origin}${key}`,
      finalStatus: 200,
      hopCount: 0,
      headers: {
        "content-type": "text/html",
        "cache-control": "public",
        "x-nextjs-cache": null,
        "x-vercel-cache": "HIT",
        "x-nextjs-prerender": "1",
        "x-matched-path": null,
        "age-present": true,
      },
    },
    browser: {
      finalUrl: `{origin}${key}`,
      clientSideRedirect: false,
      title: "t",
    },
    indexing: {
      canonical: baked,
      ogUrl: baked,
      robotsMeta: "index, follow",
      requested: {
        path: key,
        robotsTxt: { allowed: true, rule: null, userAgent: "*" },
        inSitemap: true,
      },
      final: {
        path: key,
        robotsTxt: { allowed: true, rule: null, userAgent: "*" },
        inSitemap: true,
      },
    },
    jsonld: [{ type: "Product", url: baked, id: null }],
    links: ["/", sweptBy === LIVE ? "/shop" : `${LIVE}/shop`],
    nojs: {
      rawTextLength: 100,
      rawLinkCount: 4,
      hasNoscript: false,
      screenshot: null,
    },
    screens: { desktop: null, mobile: null },
    blockedRequests: [],
    errors: [],
  };
}

function runFor(label: string, baseUrl: string): CaptureRun {
  return {
    dir: `/tmp/${label}`,
    entries: [entryFor("/p", baseUrl)],
    meta: {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      harnessVersion: "1.1.0",
      label,
      baseUrl,
      planName: "test",
      planPath: "/tmp/plan.json",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      targetCount: 1,
      skipped: [],
      masks: [],
      normalize: [],
      blockedHosts: ["js.stripe.com"],
      viewports: {
        desktop: { width: 1280, height: 900 },
        mobile: { width: 390, height: 844 },
      },
      sitemapEntryCount: 3,
      robotsTxtPresent: true,
      clockPinned: false,
    },
  };
}

function report(before: CaptureRun, after: CaptureRun): string {
  return renderReport(before, after, diffSignals(before, after), {
    pixelThreshold: 2,
    imagesDir: null,
  });
}

const NO_DIFFERENCES = "**No differences.**";

describe("the verdict a same-host pair earns", () => {
  const md = report(runFor("before", LIVE), runFor("after", LIVE));

  it("claims a clean match, because every field was determinable", () => {
    expect(md).toContain(NO_DIFFERENCES);
    expect(md).toContain(
      "| **Fields not determinable on this pair** | **0** |",
    );
  });

  it("prints no cross-origin note and no undetermined section", () => {
    expect(md).not.toContain("The two runs swept different origins");
    expect(md).not.toContain("Fields this pair cannot determine");
  });
});

describe("the verdict a cross-origin pair earns", () => {
  const md = report(runFor("before", LIVE), runFor("after", PREVIEW));

  it("NEVER claims a match while a field was not determinable", () => {
    // The whole point: a report that called an unverified field a match would
    // be the believed false green this instrument exists to prevent.
    expect(md).not.toContain(NO_DIFFERENCES);
    expect(md).toContain("not determinable on this pair");
  });

  it("counts the undetermined fields on their own verdict line, not among the signal differences", () => {
    expect(md).toContain("| **Signal differences** | **0** |");
    expect(md).toMatch(
      /\| \*\*Fields not determinable on this pair\*\* \| \*\*[1-9][0-9]*\*\* \|/,
    );
  });

  it("prints the undetermined rows in their own section", () => {
    expect(md).toContain("### Fields this pair cannot determine");
    expect(md).toContain("link rel=canonical");
  });

  it("names both origins and says which cause is normalised and which is real", () => {
    expect(md).toContain(LIVE);
    expect(md).toContain(PREVIEW);
    expect(md).toContain("isIndexableCurrentHost");
    expect(md).toContain("storefrontUrl");
  });

  it("states the limit in the structural-limits list too, not only in the header", () => {
    expect(md).toContain("**This pair is cross-origin.**");
  });
  it("does not head a coverage gap as a count of differences", () => {
    // The group's own note opens "NOT differences — a coverage gap", the
    // verdict table counts them on their own line, and signalRows excludes
    // them; a heading saying "58 differences" contradicts all three in the one
    // line a reader scanning headings actually sees.
    expect(md).not.toMatch(
      /### Fields this pair cannot determine — \d+ difference/,
    );
    expect(md).toMatch(/### Fields this pair cannot determine — \d+ fields?/);
    expect(md).toContain(
      "## Differences, and fields that could not be determined",
    );
  });
});
