/**
 * Report rendering.
 *
 * The report is the deliverable a captain reads, so it is structured for triage
 * rather than for completeness: the verdict first, then the differences grouped
 * by kind in severity order, then the two run headers, then — always, whether or
 * not anything differed — the list of what the run agreed not to look at. A
 * masked region is a blind spot the run chose; leaving that list in a source
 * comment would let a green report overstate what it checked.
 */

import {
  DIFF_GROUPS,
  GROUP_NOTES,
  GROUP_TITLES,
  NOJS_INK_EPSILON,
  sortRows,
  signalRows,
  undeterminedRows,
} from "./diff";
import type { DiffGroup, DiffResult, DiffRow } from "./diff";
import type { CaptureRun } from "./types";

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function truncate(value: string, max = 300): string {
  return value.length <= max
    ? value
    : `${value.slice(0, max)}… (${value.length} chars)`;
}

function runHeader(label: string, run: CaptureRun): string[] {
  return [
    `**${label}** — \`${run.dir}\``,
    "",
    `| field | value |`,
    `| --- | --- |`,
    `| label | ${cell(run.meta.label)} |`,
    `| base URL | ${cell(run.meta.baseUrl)} |`,
    `| plan | ${cell(run.meta.planName)} |`,
    `| plan file | ${cell(run.meta.planPath)} |`,
    `| captured | ${cell(run.meta.startedAt)} → ${cell(run.meta.finishedAt)} |`,
    `| URLs captured | ${run.entries.length} |`,
    `| URLs skipped by the plan | ${run.meta.skipped.length} |`,
    `| sitemap.xml entries seen | ${run.meta.sitemapEntryCount} |`,
    `| robots.txt served | ${run.meta.robotsTxtPresent ? "yes" : "no"} |`,
    `| page clock pinned | ${run.meta.clockPinned ? "yes (--freeze-clock)" : "no"} |`,
    `| harness version | ${cell(run.meta.harnessVersion)} |`,
    "",
  ];
}

// `undetermined` rows are a coverage gap, not a difference — the group's own
// note says so, the verdict table counts them on their own line, and
// `signalRows` excludes them. Heading them "58 differences" would contradict
// all three in the one line a reader scanning headings actually sees.
function countedAs(group: DiffGroup, n: number): string {
  const noun = group === "undetermined" ? "field" : "difference";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function groupSection(group: DiffGroup, rows: readonly DiffRow[]): string[] {
  const mine = rows.filter((r) => r.group === group);
  if (mine.length === 0) return [];
  const lines = [
    `### ${GROUP_TITLES[group]} — ${countedAs(group, mine.length)}`,
    "",
    GROUP_NOTES[group],
    "",
    "| URL | field | before | after | note |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of mine) {
    lines.push(
      `| \`${cell(r.key)}\` | ${cell(r.field)} | ${cell(truncate(r.before))} | ${cell(truncate(r.after))} | ${cell(r.detail ?? "")} |`,
    );
  }
  lines.push("");
  return lines;
}

function masksBlock(run: CaptureRun): string[] {
  if (run.meta.masks.length === 0) return ["_None._", ""];
  const lines = ["| selector | applies to | why |", "| --- | --- | --- |"];
  for (const m of run.meta.masks) {
    lines.push(
      `| \`${cell(m.selector)}\` | ${m.paths.length === 0 ? "every captured URL" : cell(m.paths.join(", "))} | ${cell(m.why)} |`,
    );
  }
  lines.push("");
  return lines;
}

function normalizeBlock(run: CaptureRun): string[] {
  if (run.meta.normalize.length === 0) {
    return [
      "_No plan rules._ The target's own origin is always rewritten to the literal token `{origin}` so a capture pair does not differ on every row because of its host; a third-party origin is left intact.",
      "",
    ];
  }
  const lines = [
    "| field | pattern | replaced with | why |",
    "| --- | --- | --- | --- |",
  ];
  for (const n of run.meta.normalize) {
    lines.push(
      `| ${cell(n.field)} | \`${cell(n.pattern)}\`/${cell(n.flags)} | \`${cell(n.replace)}\` | ${cell(n.why)} |`,
    );
  }
  lines.push("");
  return lines;
}

function blockedHostsBlock(run: CaptureRun): string[] {
  return [
    "Requests to these hosts are refused before they leave the browser. This is a safety control first — no payment provider script ever loads — and it means any page whose content comes from one of them is captured without it.",
    "",
    `\`${run.meta.blockedHosts.join("`, `")}\``,
    "",
    "A plan's `blocked_hosts` is unioned with the built-in payment-host list and can never shrink it.",
    "",
  ];
}

function skippedBlock(run: CaptureRun): string[] {
  if (run.meta.skipped.length === 0) return ["_None._", ""];
  const lines = ["| URL | why |", "| --- | --- |"];
  for (const s of run.meta.skipped) {
    lines.push(`| \`${cell(s.path)}\` | ${cell(s.reason)} |`);
  }
  lines.push("");
  return lines;
}

/**
 * Render one blind-spot list, saying which run it describes.
 *
 * These used to be rendered from the AFTER run alone and labelled as though
 * they described the comparison. They do not: a before run captured with
 * different normalise rules, different masks or `--freeze-clock` on was being
 * presented under the after run's blind-spot list, which overstates what the
 * pair actually agreed not to look at. When the two agree there is one list and
 * it says so; when they differ, both are printed and the disagreement is also a
 * comparability row at the top of the report.
 */
function bothRuns(
  heading: string,
  render: (run: CaptureRun) => string[],
  before: CaptureRun,
  after: CaptureRun,
): string[] {
  const beforeLines = render(before);
  const afterLines = render(after);
  if (beforeLines.join("\n") === afterLines.join("\n")) {
    return [
      `### ${heading}`,
      "",
      "_Both runs declared the same list._",
      "",
      ...afterLines,
    ];
  }
  return [
    `### ${heading}`,
    "",
    "**The two runs declared DIFFERENT lists**, so this section describes each one separately. A region or field blanked in only one of them was compared against something the other run did not blank.",
    "",
    `**Before run (\`${cell(before.meta.label)}\`)**`,
    "",
    ...beforeLines,
    `**After run (\`${cell(after.meta.label)}\`)**`,
    "",
    ...afterLines,
  ];
}

/** Render the full markdown report. */
export function renderReport(
  before: CaptureRun,
  after: CaptureRun,
  result: DiffResult,
  extra: { readonly pixelThreshold: number; readonly imagesDir: string | null },
): string {
  const rows = sortRows(result.rows);
  const signals = signalRows(rows);
  const undetermined = undeterminedRows(rows);
  const pixels = rows.filter((r) => r.group === "pixel");
  const cache = rows.filter((r) => r.group === "cache");

  const lines: string[] = [
    `# Port verification — capture comparison`,
    "",
    `\`${before.meta.label}\` → \`${after.meta.label}\``,
    "",
    "## Verdict",
    "",
    "| | count |",
    "| --- | --- |",
    `| URLs compared | ${result.comparedKeys} |`,
    `| **Signal differences** | **${signals.length}** |`,
    `| **Fields not determinable on this pair** | **${undetermined.length}** |`,
    `| Cache/prerender header differences | ${cache.length} |`,
    `| Screenshot differences | ${pixels.length} |`,
    `| URLs only in the before run | ${result.onlyInBefore.length} |`,
    `| URLs only in the after run | ${result.onlyInAfter.length} |`,
    `| URLs that failed to capture in the before run | ${result.failedInBefore.length} |`,
    `| URLs that failed to capture in the after run | ${result.failedInAfter.length} |`,
    `| **URLs that failed to capture in BOTH runs — nothing about them was verified** | **${result.failedInBoth.length}** |`,
    `| **Run-level settings that differ (see below)** | **${result.comparability.length}** |`,
    "",
  ];

  // FIRST, above everything, because it decides whether the rest means
  // anything. Two runs taken by different builds or under different settings
  // can differ for reasons that have nothing to do with the storefront — and,
  // worse, can agree for the same kind of reason.
  if (result.comparability.length > 0) {
    lines.push(
      `> **THESE TWO RUNS ARE NOT DIRECTLY COMPARABLE.** ${result.comparability.length} run-level setting${result.comparability.length === 1 ? " differs" : "s differ"} between the before and after captures, so a difference below may describe the HARNESS rather than the storefront, and an absence of differences proves nothing. Re-capture both sides with one build and one set of options.`,
      ">",
      ...result.comparability.map(
        (r) =>
          `> - **${cell(r.field)}**: \`${cell(r.before)}\` → \`${cell(r.after)}\``,
      ),
      "",
    );
  }

  // A NOTE, not a verdict — but a note that has to be SPECIFIC, because a
  // cross-origin pair does not simply compare clean on this storefront and
  // saying it does would hand the reader a wall of red to discount wholesale.
  // Three consequences, three different treatments, all named:
  //   1. baked-origin URLs, which the comparison normalises away;
  //   2. what that normalisation then cannot verify, reported as undetermined;
  //   3. host-gated indexing, which is real and is left alone.
  if (before.meta.baseUrl !== after.meta.baseUrl) {
    lines.push(
      `> **The two runs swept different origins** — \`${cell(before.meta.baseUrl)}\` → \`${cell(after.meta.baseUrl)}\`. This is a supported comparison and does not, on its own, make the pair untrustworthy. Three things follow from it, and they are not the same:`,
      ">",
      `> - **Normalised away.** Both of those origins are rewritten to the literal token \`{origin}\` in every compared URL — canonical, \`og:url\`, JSON-LD \`url\`/\`@id\`, rendered hrefs, every redirect hop and its \`Location\`, the final URL, and blocked-request URLs — so a URL the storefront baked from its configured store domain (\`storefrontUrl\`, \`resolveJsonLdSiteUrl\`) lines up with its counterpart instead of differing on every row. A THIRD-PARTY origin is still left intact and still reported: a canonical that starts naming somebody else's host is the regression this harness exists to catch.`,
      `> - **NOT VERIFIED, and reported as such.** ${undetermined.length} field${undetermined.length === 1 ? "" : "s"} below sit${undetermined.length === 1 ? "s" : ""} in **${GROUP_TITLES.undetermined}**. Once both origins collapse onto one token, \`{origin}\` no longer names the same real origin on the two sides, so a value that MATCHES may be two different origins agreeing only in shape — an origin regression (a canonical that started naming the sweep host instead of the store domain) is indistinguishable from agreement, and capture has already erased which origin the token replaced. Those fields are therefore reported as undetermined rather than as matches, and they make the exit code 1. **A cross-origin pair cannot give a determinate verdict on an origin-bearing signal.** Capture both runs against the SAME host to get one.`,
      `> - **REAL, and left in.** The \`meta name=robots\` and \`robots.txt verdict\` rows WILL differ by construction on a cross-origin pair, and those rows are true. This storefront derives indexing from the REQUEST host (\`isIndexableCurrentHost\` in \`lib/indexing-decision.ts\`, and \`app/robots.ts\`), failing closed for any host that is not the store's configured domain — so a preview or rehearsal host genuinely is \`noindex\`. Read those rows as findings, not as cross-origin noise; they are not suppressed, exempted or downgraded anywhere.`,
      "",
    );
  }

  // Stated before anything else, because it is the one count a reader could
  // otherwise mistake for a clean comparison: a URL that failed the same way
  // twice contributes no signal difference and would read as "matched".
  if (result.failedInBoth.length > 0) {
    lines.push(
      `> **${result.failedInBoth.length} URL${result.failedInBoth.length === 1 ? "" : "s"} failed to capture in BOTH runs.** Their signals were never read, so nothing below is evidence about them, and a matching failure on both sides is not a match. Re-capture before treating this comparison as complete:`,
      ">",
      ...result.failedInBoth.map((k) => `> - \`${cell(k)}\``),
      "",
    );
  }

  // "Matched" is a claim about what was CHECKED, so it may only be made when
  // every field was determinable. An undetermined row means a field was not
  // verified either way, and a report that called that a match would be the
  // false green this instrument exists to prevent — hence the explicit guard
  // rather than relying on undetermined rows happening to be in `rows`.
  if (rows.length === 0 && undetermined.length === 0) {
    lines.push(
      "**No differences.** Every captured signal and every screenshot matched across the two runs.",
      "",
      "Read the blind-spot list below before treating this as proof of no change: it names exactly what this run agreed not to look at.",
      "",
    );
  } else if (signals.length === 0 && undetermined.length > 0) {
    lines.push(
      `**No signal differences — but ${undetermined.length} field${undetermined.length === 1 ? " was" : "s were"} not determinable on this pair.** Nothing that could be compared moved, and the undetermined fields were not verified either way. This is not a clean run; see **${GROUP_TITLES.undetermined}** below.`,
      "",
    );
  } else if (signals.length === 0) {
    lines.push(
      "**No signal differences.** What every page *is* — status, canonical, robots, structured data, links, no-JavaScript rendering — is unchanged. Only pixels and/or cache headers moved.",
      "",
    );
  } else {
    lines.push(
      `**${signals.length} signal difference${signals.length === 1 ? "" : "s"}.** These are changes a screenshot cannot show. Read this section before any image.`,
      "",
    );
  }

  lines.push(
    undetermined.length > 0
      ? "## Differences, and fields that could not be determined"
      : "## Differences",
    "",
  );
  if (rows.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const group of DIFF_GROUPS) {
      lines.push(...groupSection(group, rows));
    }
  }

  lines.push("## What this run did not look at", "");
  lines.push(
    "Every entry below is a deliberate blind spot. A difference inside one of these regions or fields would not appear above.",
    "",
  );

  lines.push(
    ...bothRuns("Masked screenshot regions", masksBlock, before, after),
  );
  lines.push(
    ...bothRuns("Normalised signal values", normalizeBlock, before, after),
  );
  lines.push(
    ...bothRuns("Blocked network hosts", blockedHostsBlock, before, after),
  );
  lines.push(
    ...bothRuns("URLs the plan did not capture", skippedBlock, before, after),
  );

  lines.push("### Structural limits of this harness", "");
  lines.push(
    "- Every request this harness ISSUES is a GET, and it never signs in, submits, adds to a cart or pays, so anything reachable only behind an interaction is not captured. That is a statement about what the harness drives, not a guarantee about every byte that left the browser — the next three rows are the limits on it, and they are not footnotes.",
    "- Non-GET requests the PAGE attempts are refused and recorded, not performed.",
    "- That refusal does NOT extend to a service worker. The GET-only guard is a `context.route()` handler, which Playwright does not apply to requests a service worker issues, and the capture context does not block service workers. For a target that registers one, a non-GET it issues is neither refused nor recorded, and a blocked host is reachable through it — so on such a target an empty blocked-request list is not proof that nothing mutating was attempted, only that nothing mutating reached the guard. This gap is ACCEPTED and no code fix is coming (`260825-port-verify-service-worker-blind-guard`, closed as declined), so the protection is a per-target measurement: the harness must not be pointed at a store whose service-worker status has not been measured.",
    "- A GET to a blocked host is aborted WITHOUT being recorded, unlike a non-GET, which is recorded and then aborted. So this report cannot show whether a payment provider was contacted at all, and a difference between the two runs in payment-script loading does NOT appear as a difference — both runs abort identically and both record nothing, so that port defect renders here as a match. Unlike the service-worker gap above, this one is STILL OPEN and undecided (`260825-port-verify-blocked-get-not-recorded`).",
    `- Screenshots compare at a per-channel threshold of ${extra.pixelThreshold}; a change smaller than that on every channel is not reported.`,
    `- The no-JavaScript ink ratio compares at an absolute epsilon of ${NOJS_INK_EPSILON}; a move smaller than that raises no ink row. That is headroom over the MEASUREMENT QUANTUM (\`inkRatio\` rounds to 4 decimal places, so 0.0001), not a multiple of measured jitter — measured jitter across 63 ink comparisons on two real-host self-diff pairs and one synthetic pair was exactly 0.000000. The smallest healthy ink ratio observed was 0.0745, so a blank prerendered shell loses at least that much and clears the epsilon by 74x. A sub-epsilon ink move is still visible: the no-JavaScript screenshot is pixel-compared in the pixel tier independently of this row.`,
    "- A URL that failed to capture in BOTH runs is counted in the verdict and reported as its own row; it is never treated as a matching comparison.",
    "- A COMPLETED capture directory is never cleared without `--overwrite`, so neither of the two runs compared here can have been silently replaced by a later sweep. A partial capture — one this tool started and did not finish — is cleared freely, which is what keeps `--overwrite` rare enough to still mean something. Neither form of the flag lets `capture.ts` delete a directory it did not write.",
    "- The run-level settings that govern comparability (harness version, clock pinning, viewports, normalise rules, masks, blocked hosts) are compared, and any mismatch is reported at the top as its own group. A procedure change that leaves the record shape alone would otherwise compare clean. The base URL is deliberately NOT one of them — a cross-origin pair is supported, so a differing origin is a note above rather than a reason to distrust the comparison.",
    "- Cache and prerender headers are recorded, not asserted, and they do NOT decide the exit code: `x-vercel-cache` flips between HIT and MISS on its own schedule, so an exit code that carried it would be red on every healthy real-host pair and would stop meaning anything. `--fail-on any` means any signal, capture, undetermined or pixel row. The cache rows are still printed in full above.",
    ...(before.meta.baseUrl === after.meta.baseUrl
      ? []
      : [
          "- **This pair is cross-origin.** Both runs' base origins were rewritten to `{origin}` in every compared URL (canonical, og:url, JSON-LD url/@id, rendered hrefs, redirect hops and Locations, final URL, blocked-request URLs), so a URL baked from the store's configured domain does not differ merely because the two sweeps used different hosts; a third-party origin is untouched and still reported. That reconciliation is not a verification: once both origins collapse onto one token, a value that MATCHES could be two different origins agreeing only in shape, and capture has already erased which origin the token stood for — so an origin-bearing field that matches with the token present is reported as UNDETERMINED, counted separately from the signal differences, and makes the exit code 1. Several rows per URL is the honest cost of that. What this does NOT normalise, on purpose, is indexing: `meta name=robots` and the `robots.txt verdict` are gated on the REQUEST host (`isIndexableCurrentHost`, `app/robots.ts`) and fail closed off the store's configured domain, so those rows differ by construction on a cross-origin pair and are REAL — a preview or rehearsal host is genuinely noindex. Only a SAME-HOST pair gives a determinate verdict on an origin-bearing signal, which is why the recommended workflow is one host at two points in time.",
        ]),
    `- Animations and transitions are disabled and \`Math.random\` is seeded. In the AFTER run the page clock was ${
      after.meta.clockPinned
        ? "pinned, so a page whose content depends on wall-clock time will not show that dependence here"
        : "NOT pinned (`--freeze-clock` was off), so a page that renders a date or a countdown can differ between two runs for that reason alone"
    }.`,
    "- Only the first level of a sitemap index is followed, and at most 25 child sitemaps.",
    "- A page's repeated canonical or robots tags are recorded as one sorted, joined value; their document order is not.",
    "",
  );

  lines.push("## Runs compared", "");
  lines.push(...runHeader("Before", before));
  lines.push(...runHeader("After", after));

  if (extra.imagesDir !== null && pixels.length > 0) {
    lines.push(
      "## Image artifacts",
      "",
      `Diff images: \`${extra.imagesDir}\``,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}
