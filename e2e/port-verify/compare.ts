/**
 * port-verify compare — diff two capture directories into a report.
 *
 *   bun run e2e/port-verify/compare.ts \
 *     --before .port-verify/before --after .port-verify/after \
 *     --out .port-verify/report
 *
 * STRUCTURED FOR TRIAGE. Signal differences — what a page IS — are counted in
 * the verdict, printed first, and never buried under pixels. A canonical tag
 * that flipped outranks a two-pixel font shift and the report says so by
 * construction rather than by convention.
 *
 * Exit codes: 0 clean, 1 differences found (subject to `--fail-on`), 2 the
 * comparison itself could not run. A screenshot that will not decode is NOT
 * code 2 — it is one reported difference among the others, and the report is
 * still written. Losing every signal difference because one PNG was truncated
 * would throw away the whole deliverable over the least important tier.
 *
 * `--fail-on any` means any signal, capture, undetermined or pixel row. Cache
 * and prerender headers are recorded, not asserted, and are deliberately left
 * out of the decision; an UNDETERMINED row is deliberately left in, under both
 * `any` and `signal`, because a comparison that could not verify a field has
 * not passed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { numberOption, parseArgv } from "./lib/args";
import {
  diffSignals,
  exitCodeFor,
  signalRows,
  sortRows,
  undeterminedRows,
} from "./lib/diff";
import type { DiffRow, FailOn } from "./lib/diff";
import { loadRun } from "./lib/load";
import { prepareOutputDir } from "./lib/outdir";
import { slugFor } from "./lib/slug";
import { decodePng, diffImages, encodePng } from "./lib/png";
import type { PixelDiff } from "./lib/png";
import { renderReport } from "./lib/report";
import type { CaptureEntry, CaptureRun, ScreenshotRecord } from "./lib/types";

/**
 * Per-channel tolerance, in 0-255 units.
 *
 * Not zero. Chromium's text rasterisation is not bit-identical between
 * processes on the same machine, so an exact comparison reports a few thousand
 * one-unit pixels on a page nobody touched — and a harness that cries wolf on
 * an unchanged target is the failure mode this whole thing exists to avoid. Two
 * is small enough that any visible change clears it; the report prints the
 * threshold so the blind spot is stated rather than assumed.
 */
const DEFAULT_PIXEL_THRESHOLD = 2;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

interface Args {
  before: string;
  after: string;
  out: string;
  pixelThreshold: number;
  failOn: FailOn;
}

const TOOL = "port-verify compare";

/** Every option this CLI reads. An undeclared flag is an error, not a no-op. */
const ARG_SPEC = {
  value: ["before", "after", "out", "pixel-threshold", "fail-on"],
  boolean: [],
} as const;

function parseArgs(argv: readonly string[]): Args {
  let map: ReadonlyMap<string, string>;
  try {
    map = parseArgv(argv, ARG_SPEC, TOOL).values;
  } catch (err) {
    fail((err as Error).message);
  }
  const before = map.get("before") ?? "";
  const after = map.get("after") ?? "";
  const outDir = map.get("out") ?? "";
  if (before === "" || after === "" || outDir === "") {
    fail(
      "port-verify compare: --before, --after and --out are required.\n" +
        "  usage: bun run e2e/port-verify/compare.ts --before <dir> --after <dir> --out <dir> [--fail-on any|signal|none]",
    );
  }
  const failOnRaw = map.get("fail-on") ?? "any";
  if (failOnRaw !== "any" && failOnRaw !== "signal" && failOnRaw !== "none") {
    fail(
      `port-verify compare: --fail-on ${failOnRaw} is not one of any, signal or none`,
    );
  }
  let pixelThreshold: number;
  try {
    pixelThreshold = numberOption(
      map,
      "pixel-threshold",
      DEFAULT_PIXEL_THRESHOLD,
      0,
      255,
      TOOL,
    );
  } catch (err) {
    fail((err as Error).message);
  }
  return { before, after, out: outDir, pixelThreshold, failOn: failOnRaw };
}

type ShotName = "desktop" | "mobile" | "nojs";

function shotOf(entry: CaptureEntry, name: ShotName): ScreenshotRecord | null {
  if (name === "nojs") return entry.nojs?.screenshot ?? null;
  return entry.screens[name];
}

/** Compare one screenshot pair, writing a diff image when they differ. */
function comparePair(
  key: string,
  name: ShotName,
  before: CaptureRun,
  after: CaptureRun,
  b: ScreenshotRecord | null,
  a: ScreenshotRecord | null,
  imagesDir: string,
  threshold: number,
  reportDir: string,
): DiffRow[] {
  if (b === null && a === null) return [];
  if (b === null || a === null) {
    return [
      {
        group: "pixel",
        key,
        field: `${name} screenshot`,
        before: b === null ? "(not captured)" : b.file,
        after: a === null ? "(not captured)" : a.file,
        detail: "one run captured this screenshot and the other did not",
      },
    ];
  }
  const bPath = join(before.dir, b.file);
  const aPath = join(after.dir, a.file);
  if (!existsSync(bPath) || !existsSync(aPath)) {
    return [
      {
        group: "pixel",
        key,
        field: `${name} screenshot`,
        before: existsSync(bPath) ? b.file : "(file missing)",
        after: existsSync(aPath) ? a.file : "(file missing)",
        detail: "the capture record names a screenshot that is not on disk",
      },
    ];
  }
  // READ, DECODE, DIFF AND WRITE INSIDE THE TRY. `decodePng` throws by name on
  // a 16-bit, interlaced, truncated or non-PNG file, and `inflateSync` throws
  // on a corrupt deflate stream — a screenshot left half-written by a killed
  // capture or a full disk is enough. Uncaught, that unwound the whole pixel
  // loop, which runs BEFORE the report is written into a directory already
  // cleared, so one bad PNG destroyed every signal difference the run found and
  // exited 1 with nothing on disk to read. An unreadable screenshot is a
  // reportable difference, not the end of the comparison.
  let diff: PixelDiff;
  let file: string;
  try {
    const bImage = decodePng(readFileSync(bPath));
    const aImage = decodePng(readFileSync(aPath));
    diff = diffImages(bImage, aImage, threshold);
    if (diff.changedPixels === 0 && diff.dimensionsEqual) return [];
    file = join(imagesDir, `${slugFor(key)}.${name}.diff.png`);
    writeFileSync(file, encodePng(diff.image));
  } catch (err) {
    return [
      {
        group: "pixel",
        key,
        field: `${name} screenshot`,
        before: b.file,
        after: a.file,
        detail:
          `this pair was NOT compared — ${(err as Error).message}. ` +
          `Every other difference in this report still stands; re-capture this URL to compare its pixels.`,
      },
    ];
  }

  const rows: DiffRow[] = [];
  if (!diff.dimensionsEqual) {
    rows.push({
      group: "pixel",
      key,
      field: `${name} screenshot size`,
      before: `${diff.beforeWidth}x${diff.beforeHeight}`,
      after: `${diff.afterWidth}x${diff.afterHeight}`,
      detail: `diff image: ${relative(reportDir, file)}`,
    });
  }
  if (diff.changedPixels > 0) {
    rows.push({
      group: "pixel",
      key,
      field: `${name} screenshot pixels`,
      before: `${b.width}x${b.height}, ink ${b.inkRatio}`,
      after: `${a.width}x${a.height}, ink ${a.inkRatio}`,
      detail:
        `${diff.changedPixels} of ${diff.comparedPixels} compared pixels differ ` +
        `(${(diff.changedRatio * 100).toFixed(3)}% of the frame, max channel delta ${diff.maxChannelDelta}); ` +
        `diff image: ${relative(reportDir, file)}`,
    });
  }
  return rows;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  let before: CaptureRun;
  let after: CaptureRun;
  try {
    before = loadRun(args.before);
    after = loadRun(args.after);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
    return;
  }

  const reportDir = args.out;
  try {
    // PERMISSIVE ON PURPOSE, unlike capture.ts. A report is fully reproducible
    // from the two captures it was built from, so nothing here is
    // irreplaceable and there is no baseline to protect — `--overwrite` would
    // only be ceremony, and ceremony on the harmless command is what makes the
    // flag a reflex on the dangerous one.
    prepareOutputDir(reportDir, {
      flag: "--out",
      completeMarker: "report.json",
      partialMarkers: ["images"],
      overwrite: true,
      completeWarning: "",
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
  }
  const imagesDir = join(reportDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  const result = diffSignals(before, after);
  const pixelRows: DiffRow[] = [];
  const afterByKey = new Map(after.entries.map((e) => [e.key, e]));
  for (const b of before.entries) {
    const a = afterByKey.get(b.key);
    if (a === undefined) continue;
    for (const name of ["desktop", "mobile", "nojs"] as const) {
      pixelRows.push(
        ...comparePair(
          b.key,
          name,
          before,
          after,
          shotOf(b, name),
          shotOf(a, name),
          imagesDir,
          args.pixelThreshold,
          reportDir,
        ),
      );
    }
  }

  const rows = sortRows([...result.rows, ...pixelRows]);
  const full = { ...result, rows };
  const markdown = renderReport(before, after, full, {
    pixelThreshold: args.pixelThreshold,
    imagesDir: relative(reportDir, imagesDir),
  });
  writeFileSync(join(reportDir, "report.md"), markdown);
  writeFileSync(
    join(reportDir, "report.json"),
    `${JSON.stringify(
      {
        before: { dir: before.dir, meta: before.meta },
        after: { dir: after.dir, meta: after.meta },
        comparedKeys: full.comparedKeys,
        onlyInBefore: full.onlyInBefore,
        onlyInAfter: full.onlyInAfter,
        failedInBefore: full.failedInBefore,
        failedInAfter: full.failedInAfter,
        failedInBoth: full.failedInBoth,
        comparability: full.comparability,
        pixelThreshold: args.pixelThreshold,
        rows,
      },
      null,
      2,
    )}\n`,
  );

  const signals = signalRows(rows);
  const undetermined = undeterminedRows(rows);
  const pixels = rows.filter((r) => r.group === "pixel");
  const cache = rows.filter((r) => r.group === "cache");
  out(`port-verify compare: ${full.comparedKeys} URLs compared`);
  if (full.comparability.length > 0) {
    // Above everything else: it decides whether the rest of these counts mean
    // anything at all.
    out(
      `  !! THESE TWO RUNS ARE NOT DIRECTLY COMPARABLE — ${full.comparability.length} run-level setting(s) differ: ` +
        full.comparability.map((r) => r.field).join(", "),
    );
  }
  if (full.failedInBoth.length > 0) {
    // Loud, and above the counts: nothing about these URLs was verified, and a
    // matching failure on both sides is not a match.
    out(
      `  !! ${full.failedInBoth.length} URL(s) FAILED TO CAPTURE IN BOTH RUNS — nothing about them was verified: ` +
        full.failedInBoth.join(", "),
    );
  }
  if (undetermined.length > 0) {
    // Loud, and counted apart from the signal differences: these are fields
    // nothing was learned about, not fields that agreed.
    out(
      `  !! ${undetermined.length} FIELD(S) NOT DETERMINABLE on this pair — the two runs swept different origins, so an origin-bearing value that matches may be two different origins agreeing only in shape. Capture both runs against the same host for a determinate verdict.`,
    );
  }
  out(`  signal differences: ${signals.length}`);
  out(`  fields not determinable: ${undetermined.length}`);
  out(`  cache/prerender header differences: ${cache.length}`);
  out(`  screenshot differences: ${pixels.length}`);
  out(`  report: ${join(reportDir, "report.md")}`);

  // The rule itself lives in `lib/diff.ts` — its two deliberate exceptions
  // (cache rows never count, undetermined rows always do) are stated there, and
  // a rule inlined into a `process.exit` call is one no test can reach.
  process.exit(exitCodeFor(rows, args.failOn));
}

main();
