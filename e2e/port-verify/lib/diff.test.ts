import { describe, expect, it } from "vitest";
import {
  diffSignals,
  exitCodeFor,
  signalRows,
  sortRows,
  undeterminedRows,
  DIFF_GROUPS,
  NOJS_INK_EPSILON,
} from "./diff";
import type { CaptureEntry, CaptureRun } from "./types";
import { CAPTURE_SCHEMA_VERSION } from "./types";

function indexingAt(
  path: string,
  allowed: boolean,
  rule: string | null,
  inSitemap: boolean,
): CaptureEntry["indexing"]["requested"] {
  return { path, robotsTxt: { allowed, rule, userAgent: "*" }, inSitemap };
}

function entry(
  overrides: Partial<CaptureEntry> & { key: string },
): CaptureEntry {
  return {
    kind: "product",
    mode: "full",
    http: {
      chain: [{ url: overrides.key, status: 200, location: null }],
      finalUrl: overrides.key,
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
    browser: { finalUrl: overrides.key, clientSideRedirect: false, title: "t" },
    indexing: {
      canonical: "{origin}/shop/a/b/c",
      ogUrl: "{origin}/shop/a/b/c",
      robotsMeta: "index, follow",
      requested: indexingAt(overrides.key, true, null, true),
      final: indexingAt(overrides.key, true, null, true),
    },
    jsonld: [{ type: "Product", url: "{origin}/shop/a/b/c", id: null }],
    links: ["/", "/shop"],
    nojs: {
      rawTextLength: 100,
      rawLinkCount: 4,
      hasNoscript: false,
      screenshot: null,
    },
    screens: { desktop: null, mobile: null },
    blockedRequests: [],
    errors: [],
    ...overrides,
  };
}

function run(label: string, entries: CaptureEntry[]): CaptureRun {
  return {
    dir: `/tmp/${label}`,
    entries,
    meta: {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      harnessVersion: "1.0.0",
      label,
      baseUrl: "https://store.invalid",
      planName: "test",
      planPath: "/tmp/plan.json",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      targetCount: entries.length,
      skipped: [],
      masks: [],
      normalize: [],
      blockedHosts: [],
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

describe("the changes a screenshot cannot show", () => {
  it("names a canonical flip", () => {
    const before = run("before", [entry({ key: "/p" })]);
    const after = run("after", [
      entry({
        key: "/p",
        indexing: {
          canonical: "{origin}/products/c",
          ogUrl: "{origin}/shop/a/b/c",
          robotsMeta: "index, follow",
          requested: indexingAt("/p", true, null, true),
          final: indexingAt("/p", true, null, true),
        },
      }),
    ]);
    const rows = diffSignals(before, after).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe("indexing");
    expect(rows[0]!.field).toBe("link rel=canonical");
    expect(rows[0]!.before).toBe("{origin}/shop/a/b/c");
    expect(rows[0]!.after).toBe("{origin}/products/c");
  });

  it("distinguishes a 308 from a 200 carrying a client-side redirect", () => {
    // These were a real defect in this codebase. If they collapsed into one
    // another the harness would report a fixed redirect as unchanged.
    const clientSide = entry({
      key: "/products/c",
      http: {
        chain: [{ url: "/products/c", status: 200, location: null }],
        finalUrl: "/products/c",
        finalStatus: 200,
        hopCount: 0,
        headers: entry({ key: "/x" }).http.headers,
      },
      browser: {
        finalUrl: "/shop/a/b/c",
        clientSideRedirect: true,
        title: "t",
      },
    });
    const real308 = entry({
      key: "/products/c",
      http: {
        chain: [
          { url: "/products/c", status: 308, location: "/shop/a/b/c" },
          { url: "/shop/a/b/c", status: 200, location: null },
        ],
        finalUrl: "/shop/a/b/c",
        finalStatus: 200,
        hopCount: 1,
        headers: entry({ key: "/x" }).http.headers,
      },
      browser: {
        finalUrl: "/shop/a/b/c",
        clientSideRedirect: false,
        title: "t",
      },
    });
    const rows = diffSignals(run("b", [clientSide]), run("a", [real308])).rows;
    const fields = rows.map((r) => r.field);
    expect(fields).toContain("redirect hop count");
    expect(fields).toContain("redirect chain");
    expect(fields).toContain("client-side redirect");
    expect(rows.every((r) => r.group === "redirect")).toBe(true);
  });

  it("names a changed document title", () => {
    const after = entry({
      key: "/p",
      browser: { finalUrl: "/p", clientSideRedirect: false, title: "changed" },
    });
    const rows = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [after]),
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.field).toBe("document title");
    expect(rows[0]!.group).toBe("indexing");
  });

  it("reports a robots.txt verdict flip even when the meta tag is unchanged", () => {
    const after = entry({
      key: "/p",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/p", false, "Disallow: /", true),
        final: indexingAt("/p", false, "Disallow: /", true),
      },
    });
    const rows = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [after]),
    ).rows;
    expect(rows.map((r) => r.field)).toEqual([
      "robots.txt verdict (requested path)",
      "robots.txt winning rule (requested path)",
    ]);
  });

  it("keys robots.txt and sitemap on the REQUESTED path, so a redirect cannot hide the change", () => {
    // The flat product URL is the case: 200 before the port, 308 after it. The
    // port drops /products/c from the sitemap and 308s it onto the nested URL,
    // which stays listed. Keyed on the DESTINATION alone, "before" measures
    // /products/c and "after" measures /shop/a/b/c — both listed — and the drop
    // is invisible. The requested-path row is the only thing that catches it.
    const before = entry({
      key: "/products/c",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/products/c", true, null, true),
        final: indexingAt("/products/c", true, null, true),
      },
    });
    const after = entry({
      key: "/products/c",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/products/c", true, null, false),
        final: indexingAt("/shop/a/b/c", true, null, true),
      },
    });
    const rows = diffSignals(run("b", [before]), run("a", [after])).rows.filter(
      (r) => r.group === "indexing",
    );
    expect(rows.map((r) => r.field)).toEqual([
      "present in sitemap.xml (requested path)",
    ]);
    expect(rows[0]!.before).toBe("true");
    expect(rows[0]!.after).toBe("false");
  });

  it("also reports the destination's own verdict, naming both paths", () => {
    const before = entry({
      key: "/products/c",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/products/c", true, null, true),
        final: indexingAt("/products/c", true, null, true),
      },
    });
    const after = entry({
      key: "/products/c",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/products/c", true, null, true),
        // The port's 308 lands somewhere robots.txt disallows.
        final: indexingAt("/shop/a/b/c", false, "Disallow: /shop/", true),
      },
    });
    const rows = diffSignals(run("b", [before]), run("a", [after])).rows.filter(
      (r) => r.group === "indexing",
    );
    expect(rows.map((r) => r.field)).toEqual([
      "robots.txt verdict (final path)",
      "robots.txt winning rule (final path)",
    ]);
    // The two sides measured different paths; the row says which, so nobody
    // reads it as one path having changed its mind.
    expect(rows[0]!.detail).toBe("/products/c -> /shop/a/b/c");
  });

  it("does not report the final path twice when the URL did not redirect", () => {
    const after = entry({
      key: "/p",
      indexing: {
        canonical: "{origin}/shop/a/b/c",
        ogUrl: "{origin}/shop/a/b/c",
        robotsMeta: "index, follow",
        requested: indexingAt("/p", true, null, false),
        final: indexingAt("/p", true, null, false),
      },
    });
    const rows = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [after]),
    ).rows;
    expect(rows.map((r) => r.field)).toEqual([
      "present in sitemap.xml (requested path)",
    ]);
  });

  it("reports each changed href and each changed JSON-LD node individually", () => {
    const after = entry({
      key: "/p",
      links: ["/", "/shop/kitchen"],
      jsonld: [{ type: "Product", url: "{origin}/products/c", id: null }],
    });
    const rows = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [after]),
    ).rows;
    expect(rows.filter((r) => r.group === "links").map((r) => r.field)).toEqual(
      ["href removed", "href added"],
    );
    expect(rows.filter((r) => r.group === "structured-data")).toHaveLength(2);
  });

  it("names a prerendered shell that lost its content", () => {
    const after = entry({
      key: "/p",
      nojs: {
        rawTextLength: 0,
        rawLinkCount: 0,
        hasNoscript: false,
        screenshot: null,
      },
    });
    const rows = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [after]),
    ).rows;
    expect(rows.every((r) => r.group === "nojs")).toBe(true);
    expect(rows.map((r) => r.field)).toContain("prerendered text length");
  });

  it("records a URL captured in only one of the two runs", () => {
    const result = diffSignals(
      run("b", [entry({ key: "/a" })]),
      run("a", [entry({ key: "/b" })]),
    );
    expect(result.onlyInBefore).toEqual(["/a"]);
    expect(result.onlyInAfter).toEqual(["/b"]);
    expect(result.comparedKeys).toBe(0);
  });
});

describe("a URL that failed to capture is never a clean comparison", () => {
  function failing(key: string, errors: string[]): CaptureEntry {
    return entry({
      key,
      errors,
      browser: null,
      indexing: {
        canonical: null,
        ogUrl: null,
        robotsMeta: null,
        requested: indexingAt(key, true, null, false),
        final: indexingAt(key, true, null, false),
      },
      jsonld: [],
      links: [],
      nojs: null,
      screens: { desktop: null, mobile: null },
    });
  }

  it("reports a URL that failed IDENTICALLY in both runs, which set difference cannot see", () => {
    // The deterministic case: the same deadline blown on both sweeps. Every
    // other field is null on both sides, so without this the URL contributed
    // no row at all and the report said "No differences".
    const err = ["desktop pass: desktop settle exceeded 90000ms"];
    const result = diffSignals(
      run("b", [failing("/p", err)]),
      run("a", [failing("/p", [...err])]),
    );
    const both = result.rows.filter(
      (r) => r.field === "capture failed in BOTH runs",
    );
    expect(both).toHaveLength(1);
    expect(both[0]!.group).toBe("capture");
    expect(result.failedInBoth).toEqual(["/p"]);
    expect(result.failedInBefore).toEqual(["/p"]);
    expect(result.failedInAfter).toEqual(["/p"]);
    // It is a signal-tier row, so `--fail-on signal` carries it into the exit code.
    expect(signalRows(result.rows).length).toBeGreaterThan(0);
  });

  it("counts a one-sided failure without claiming both runs failed", () => {
    const result = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [failing("/p", ["capture failed: boom"])]),
    );
    expect(result.failedInBefore).toEqual([]);
    expect(result.failedInAfter).toEqual(["/p"]);
    expect(result.failedInBoth).toEqual([]);
    expect(
      result.rows.filter((r) => r.field === "capture failed in BOTH runs"),
    ).toHaveLength(0);
  });

  it("reports nothing failed when nothing failed", () => {
    const result = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [entry({ key: "/p" })]),
    );
    expect(result.rows).toEqual([]);
    expect(result.failedInBoth).toEqual([]);
  });
});

describe("the no-JavaScript ink ratio compares against an epsilon", () => {
  function withInk(key: string, ink: number): CaptureEntry {
    return entry({
      key,
      nojs: {
        rawTextLength: 100,
        rawLinkCount: 4,
        hasNoscript: false,
        screenshot: {
          file: `${key}.nojs.png`,
          width: 10,
          height: 10,
          inkRatio: ink,
        },
      },
    });
  }

  function inkRows(b: number, a: number): number {
    return diffSignals(
      run("b", [withInk("/p", b)]),
      run("a", [withInk("/p", a)]),
    ).rows.filter((r) => r.field === "ink ratio (JS off)").length;
  }

  it("raises no row for a move below the epsilon", () => {
    // Measured jitter across 63 real ink comparisons was exactly 0.000000; the
    // epsilon is headroom over the 0.0001 measurement quantum, not a multiple
    // of observed jitter. Captured ink ratios are always 4-decimal `toFixed(4)`
    // values, so these are the shapes the comparison actually sees.
    expect(NOJS_INK_EPSILON).toBe(0.001);
    expect(inkRows(0.312, 0.312)).toBe(0);
    expect(inkRows(0.312, 0.3129)).toBe(0);
    expect(inkRows(0.312, 0.3111)).toBe(0);
  });

  it("raises a row for a move above the epsilon", () => {
    expect(inkRows(0.312, 0.3135)).toBe(1);
    expect(inkRows(0.312, 0.3105)).toBe(1);
  });

  it("always raises a row for a healthy page collapsing to a blank shell", () => {
    // The regression the no-JS pass exists for. 0.0745 was the smallest healthy
    // ink ratio measured, so a blank-shell delta clears the epsilon by ~74x.
    const rows = diffSignals(
      run("b", [withInk("/p", 0.31)]),
      run("a", [withInk("/p", 0.004)]),
    ).rows.filter((r) => r.field === "ink ratio (JS off)");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe("nojs");
    // Signal tier, not pixel tier: this is what names an empty prerendered shell.
    expect(signalRows(rows)).toHaveLength(1);
  });
});

describe("a mismatched pair must not read as a clean comparison", () => {
  function withMeta(
    label: string,
    entries: CaptureEntry[],
    meta: Partial<CaptureRun["meta"]>,
  ): CaptureRun {
    const base = run(label, entries);
    return { ...base, meta: { ...base.meta, ...meta } };
  }

  it("names a harness-version mismatch, which no schema gate can see", () => {
    // A procedure change that leaves the RECORD SHAPE alone — a viewport, the
    // settle timing, the user agent — used to compare clean and produce rows
    // describing the harness rather than the storefront.
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], { harnessVersion: "1.1.0" }),
      withMeta("a", [entry({ key: "/p" })], { harnessVersion: "1.2.0" }),
    );
    expect(result.comparability.map((r) => r.field)).toEqual([
      "harness version",
    ]);
    expect(result.comparability[0]!.before).toBe("1.1.0");
    expect(result.comparability[0]!.after).toBe("1.2.0");
    expect(result.comparability[0]!.key).toBe("*");
  });

  it("sorts comparability above every other group, including capture", () => {
    expect(DIFF_GROUPS.indexOf("comparability")).toBe(0);
    const rows = sortRows(
      diffSignals(
        withMeta("b", [entry({ key: "/p" })], { clockPinned: false }),
        withMeta("a", [entry({ key: "/q" })], { clockPinned: true }),
      ).rows,
    );
    expect(rows[0]!.group).toBe("comparability");
  });

  it("counts as a signal difference, so --fail-on signal carries it", () => {
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], { clockPinned: false }),
      withMeta("a", [entry({ key: "/p" })], { clockPinned: true }),
    );
    expect(signalRows(result.rows)).toHaveLength(1);
  });

  it("does NOT distrust a pair captured against two different origins", () => {
    // A cross-origin pair is supported — rehearsal host before a cutover
    // against the live domain after it is the clearest case — so a differing
    // base URL must raise no comparability row and no banner. What it DOES
    // raise is the undetermined group, which is a coverage gap rather than a
    // verdict on whether the two runs can be compared at all.
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], {
        baseUrl: "https://store.invalid",
      }),
      withMeta("a", [entry({ key: "/p" })], {
        baseUrl: "https://preview-abc123.vercel.app",
      }),
    );
    expect(result.comparability).toEqual([]);
    expect(signalRows(result.rows)).toEqual([]);
    expect(result.rows.every((r) => r.group === "undetermined")).toBe(true);
  });

  it("still distrusts a pair whose origin AND a real setting both moved", () => {
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], {
        baseUrl: "https://store.invalid",
        harnessVersion: "1.1.0",
      }),
      withMeta("a", [entry({ key: "/p" })], {
        baseUrl: "https://preview-abc123.vercel.app",
        harnessVersion: "1.2.0",
      }),
    );
    expect(result.comparability.map((r) => r.field)).toEqual([
      "harness version",
    ]);
  });

  it("notices differing clock pinning, viewports, normalise rules, masks and blocked hosts", () => {
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], {
        clockPinned: true,
        viewports: {
          desktop: { width: 1280, height: 900 },
          mobile: { width: 390, height: 844 },
        },
        normalize: [
          {
            field: "all",
            pattern: "sid=\\w+",
            flags: "g",
            replace: "sid={s}",
            why: "session id",
            paths: [],
          },
        ],
        masks: [{ selector: "iframe", why: "third-party", paths: [] }],
        blockedHosts: ["js.stripe.com"],
      }),
      withMeta("a", [entry({ key: "/p" })], {
        clockPinned: false,
        viewports: {
          desktop: { width: 1440, height: 900 },
          mobile: { width: 390, height: 844 },
        },
        normalize: [],
        masks: [],
        blockedHosts: ["js.stripe.com", "cdn.tracking.example"],
      }),
    );
    expect(result.comparability.map((r) => r.field).sort()).toEqual([
      "blocked hosts",
      "normalise rules",
      "page clock pinned",
      "screenshot masks",
      "viewports",
    ]);
  });

  it("reports nothing when the two runs were captured the same way", () => {
    const result = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [entry({ key: "/p" })]),
    );
    expect(result.comparability).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("ignores metadata that does not govern comparability", () => {
    // Labels and timestamps differ on every legitimate pair by construction.
    const result = diffSignals(
      withMeta("b", [entry({ key: "/p" })], {
        label: "before",
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
      withMeta("a", [entry({ key: "/p" })], {
        label: "after",
        startedAt: "2026-02-02T00:00:00.000Z",
      }),
    );
    expect(result.comparability).toEqual([]);
  });
});

describe("a cross-origin pair reconciles origins without claiming to verify them", () => {
  const LIVE = "https://store.invalid";
  const PREVIEW = "https://preview-abc123.vercel.app";

  function withMeta(
    label: string,
    entries: CaptureEntry[],
    meta: Partial<CaptureRun["meta"]>,
  ): CaptureRun {
    const base = run(label, entries);
    return { ...base, meta: { ...base.meta, ...meta } };
  }

  /**
   * One entry exactly as CAPTURE would write it on `sweptBy`.
   *
   * The shape is the point. The storefront bakes its CONFIGURED domain into the
   * canonical, `og:url`, JSON-LD and any absolute internal href
   * (`storefrontUrl(path, storeSettings.domain)`, `resolveJsonLdSiteUrl()`),
   * while the request-host values — the redirect chain, the final URL — name
   * whatever host was swept. Capture rewrites only `sweptBy`, so on a preview
   * host the baked origin survives literally while the request-host values
   * became `{origin}`; and `normalizeHref` reduces the absolute internal href to
   * a bare path only in the run that swept that same domain.
   *
   * Writing both runs' values in one identical shape — which capture never
   * emits — is what let an earlier version of these tests assert the right
   * outcome from an impossible input.
   */
  function captured(key: string, sweptBy: string): CaptureEntry {
    const baked = (path: string): string =>
      sweptBy === LIVE ? `{origin}${path}` : `${LIVE}${path}`;
    return entry({
      key,
      http: {
        chain: [
          {
            url: `{origin}/products/c`,
            status: 308,
            location: `{origin}${key}`,
          },
          { url: `{origin}${key}`, status: 200, location: null },
        ],
        finalUrl: `{origin}${key}`,
        hopCount: 1,
        finalStatus: 200,
        headers: entry({ key }).http.headers,
      },
      browser: {
        finalUrl: `{origin}${key}`,
        clientSideRedirect: false,
        title: "t",
      },
      indexing: {
        canonical: baked(key),
        ogUrl: baked(key),
        robotsMeta: "index, follow",
        requested: indexingAt(key, true, null, true),
        final: indexingAt(key, true, null, true),
      },
      jsonld: [{ type: "Product", url: baked(key), id: `${baked(key)}#p` }],
      links: [
        "/",
        sweptBy === LIVE ? "/shop" : `${LIVE}/shop`,
        "https://headkit.io",
      ],
      blockedRequests: [{ method: "POST", url: `{origin}/api/x` }],
    });
  }

  function crossOriginPair(
    before: CaptureEntry,
    after: CaptureEntry,
  ): ReturnType<typeof diffSignals> {
    return diffSignals(
      withMeta("b", [before], { baseUrl: LIVE }),
      withMeta("a", [after], { baseUrl: PREVIEW }),
    );
  }

  it("raises no DIFFERENCE when only the origin differs", () => {
    // Every one of these fields would otherwise produce a row on every
    // full-mode URL, for a reason that says nothing about the storefront.
    const result = crossOriginPair(
      captured("/p", LIVE),
      captured("/p", PREVIEW),
    );
    expect(signalRows(result.rows)).toEqual([]);
  });

  it("reconciles an absolute internal href against a bare path", () => {
    // The run that swept the store domain records `/shop`; the other keeps the
    // baked absolute URL, which origin normalisation turns into `{origin}/shop`.
    // Without the compare-time reduction those are a removed/added pair on every
    // URL, while the report claims rendered hrefs are among the fields it lines
    // up.
    const result = crossOriginPair(
      captured("/p", LIVE),
      captured("/p", PREVIEW),
    );
    expect(result.rows.filter((r) => r.group === "links")).toEqual([]);
  });

  it("reports every matching origin-bearing field as NOT DETERMINABLE", () => {
    // Capture has already erased which origin `{origin}` replaced, so a match
    // across two hosts may be two different origins agreeing only in shape.
    const result = crossOriginPair(
      captured("/p", LIVE),
      captured("/p", PREVIEW),
    );
    const undetermined = result.rows.filter((r) => r.group === "undetermined");
    expect(undetermined.map((r) => r.field).sort()).toEqual([
      "JSON-LD node",
      "browser final URL",
      "final URL",
      "href",
      "link rel=canonical",
      "meta og:url",
      "redirect chain",
    ]);
    expect(undetermined[0]!.detail).toMatch(/different origins/);
  });

  it("does not count an undetermined field among the signal differences", () => {
    const result = crossOriginPair(
      captured("/p", LIVE),
      captured("/p", PREVIEW),
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(signalRows(result.rows)).toEqual([]);
    expect(undeterminedRows(result.rows)).toHaveLength(7);
  });

  it("ranks the undetermined group above every difference group", () => {
    expect(DIFF_GROUPS.indexOf("undetermined")).toBe(
      DIFF_GROUPS.indexOf("capture") + 1,
    );
    expect(DIFF_GROUPS.indexOf("undetermined")).toBeLessThan(
      DIFF_GROUPS.indexOf("redirect"),
    );
  });

  it("still reports a canonical that genuinely differs, as a difference", () => {
    // A DIFFERENCE is determinable: it keeps its own group and does not become
    // an undetermined row.
    const after = captured("/p", PREVIEW);
    const result = crossOriginPair(captured("/p", LIVE), {
      ...after,
      indexing: { ...after.indexing, canonical: `${LIVE}/products/c` },
    });
    const canonical = result.rows.filter(
      (r) => r.field === "link rel=canonical",
    );
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.group).toBe("indexing");
    expect(canonical[0]!.before).toBe("{origin}/p");
    expect(canonical[0]!.after).toBe("{origin}/products/c");
  });

  it("still reports a third-party origin appearing in a canonical", () => {
    // The reason this is done by origin list and not by stripping every host:
    // a canonical that starts naming somebody else's domain is the regression.
    const after = captured("/p", PREVIEW);
    const result = crossOriginPair(captured("/p", LIVE), {
      ...after,
      indexing: {
        ...after.indexing,
        canonical: "https://someone-else.invalid/p",
      },
    });
    const canonical = result.rows.filter(
      (r) => r.field === "link rel=canonical",
    );
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.group).toBe("indexing");
    expect(canonical[0]!.after).toBe("https://someone-else.invalid/p");
  });

  it("still reports the host-gated robots flip, which is REAL", () => {
    // `isIndexableCurrentHost` fails closed off the store's configured domain,
    // so a preview host genuinely is noindex. Suppressing this to make a
    // cross-origin report look tidy would be the false green this instrument
    // exists to prevent.
    const after = captured("/p", PREVIEW);
    const result = crossOriginPair(captured("/p", LIVE), {
      ...after,
      indexing: {
        ...after.indexing,
        robotsMeta: "noindex, nofollow",
        requested: indexingAt("/p", false, "Disallow: /", true),
        final: indexingAt("/p", false, "Disallow: /", true),
      },
    });
    const fields = result.rows.map((r) => r.field);
    expect(fields).toContain("meta name=robots");
    expect(fields).toContain("robots.txt verdict (requested path)");
    expect(signalRows(result.rows).length).toBeGreaterThan(0);
  });

  it("emits NO undetermined row on a same-host pair", () => {
    // `pairOrigins` returns [] there and that path stays exactly as it was.
    const result = diffSignals(
      withMeta("b", [captured("/p", LIVE)], { baseUrl: LIVE }),
      withMeta("a", [captured("/p", LIVE)], { baseUrl: LIVE }),
    );
    expect(result.rows).toEqual([]);
  });

  it("does not let the shorter of two prefix origins eat the longer", () => {
    // A TLD cutover — dishee.com before, dishee.com.au after — is the clearest
    // legitimate cross-origin pair. Substituting the shorter origin first turns
    // a baked `https://dishee.com.au/p` into `{origin}.au/p`, and every
    // full-mode URL then reports a canonical that describes nothing.
    const OLD = "https://dishee.com";
    const NEW = "https://dishee.com.au";
    const bakedNew = (): CaptureEntry => {
      const base = captured("/p", LIVE);
      return {
        ...base,
        indexing: {
          ...base.indexing,
          canonical: `${NEW}/p`,
          ogUrl: `${NEW}/p`,
        },
        jsonld: [{ type: "Product", url: `${NEW}/p`, id: `${NEW}/p#p` }],
      };
    };
    const after = captured("/p", LIVE);
    const result = diffSignals(
      withMeta("b", [bakedNew()], { baseUrl: OLD }),
      withMeta(
        "a",
        [
          {
            ...after,
            indexing: {
              ...after.indexing,
              canonical: "{origin}/p",
              ogUrl: "{origin}/p",
            },
            jsonld: [
              { type: "Product", url: "{origin}/p", id: "{origin}/p#p" },
            ],
          },
        ],
        { baseUrl: NEW },
      ),
    );
    expect(signalRows(result.rows)).toEqual([]);
  });
});

describe("triage ordering", () => {
  it("puts every signal group ahead of cache and pixels", () => {
    expect(DIFF_GROUPS.indexOf("indexing")).toBeLessThan(
      DIFF_GROUPS.indexOf("pixel"),
    );
    expect(DIFF_GROUPS.indexOf("redirect")).toBeLessThan(
      DIFF_GROUPS.indexOf("cache"),
    );
    const rows = sortRows([
      {
        group: "pixel",
        key: "/a",
        field: "px",
        before: "1",
        after: "2",
        detail: null,
      },
      {
        group: "indexing",
        key: "/z",
        field: "canonical",
        before: "1",
        after: "2",
        detail: null,
      },
    ]);
    // A canonical flip must never sit below a font shift.
    expect(rows[0]!.group).toBe("indexing");
  });

  it("counts cache-header churn as neither signal nor pixel", () => {
    const rows = signalRows([
      {
        group: "cache",
        key: "/a",
        field: "x-vercel-cache",
        before: "MISS",
        after: "HIT",
        detail: null,
      },
      {
        group: "indexing",
        key: "/a",
        field: "canonical",
        before: "1",
        after: "2",
        detail: null,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe("indexing");
  });
});

describe("what makes the exit code 1", () => {
  const LIVE = "https://store.invalid";
  const PREVIEW = "https://preview-abc123.vercel.app";

  function withBaseUrl(label: string, baseUrl: string): CaptureRun {
    const base = run(label, [entry({ key: "/p" })]);
    return { ...base, meta: { ...base.meta, baseUrl } };
  }

  /** Rows produced by the real comparison, not hand-written. */
  const crossOrigin = diffSignals(
    withBaseUrl("b", LIVE),
    withBaseUrl("a", PREVIEW),
  ).rows;

  const cacheOnly = diffSignals(
    run("b", [entry({ key: "/p" })]),
    run("a", [
      entry({
        key: "/p",
        http: {
          ...entry({ key: "/p" }).http,
          headers: {
            ...entry({ key: "/p" }).http.headers,
            "x-vercel-cache": "MISS",
          },
        },
      }),
    ]),
  ).rows;

  it("does not fail a run whose only rows are cache headers", () => {
    // Recorded, not asserted: x-vercel-cache flips on its own schedule, so an
    // exit code carrying it would be red on every healthy real-host pair.
    expect(cacheOnly.every((r) => r.group === "cache")).toBe(true);
    expect(cacheOnly.length).toBeGreaterThan(0);
    expect(exitCodeFor(cacheOnly, "any")).toBe(0);
    expect(exitCodeFor(cacheOnly, "signal")).toBe(0);
  });

  it("FAILS a run carrying an undetermined field, under any and signal", () => {
    // An unverified comparison is not a pass — even though these rows are not
    // differences and are excluded from the signal count.
    expect(undeterminedRows(crossOrigin).length).toBeGreaterThan(0);
    expect(signalRows(crossOrigin)).toEqual([]);
    expect(exitCodeFor(crossOrigin, "any")).toBe(1);
    expect(exitCodeFor(crossOrigin, "signal")).toBe(1);
  });

  it("still exits 0 under --fail-on none, whatever the rows", () => {
    expect(exitCodeFor(crossOrigin, "none")).toBe(0);
    expect(exitCodeFor(cacheOnly, "none")).toBe(0);
  });

  it("fails a genuine signal difference under both failing modes", () => {
    const after = entry({ key: "/p" });
    const flipped = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [
        {
          ...after,
          indexing: { ...after.indexing, canonical: "{origin}/products/c" },
        },
      ]),
    ).rows;
    expect(exitCodeFor(flipped, "any")).toBe(1);
    expect(exitCodeFor(flipped, "signal")).toBe(1);
  });

  it("exits 0 on a pair with no rows at all", () => {
    const clean = diffSignals(
      run("b", [entry({ key: "/p" })]),
      run("a", [entry({ key: "/p" })]),
    ).rows;
    expect(clean).toEqual([]);
    expect(exitCodeFor(clean, "any")).toBe(0);
    expect(exitCodeFor(clean, "signal")).toBe(0);
  });
});
