/**
 * The acceptance gates, run end to end against the synthetic storefront.
 *
 *   bun run e2e/port-verify/gate.ts
 *
 * GATE 0 — THE SAFETY CONTROL. `/order-attempt` carries a POST form and fires a
 * POST from script the moment it loads. The capture must record the attempt and
 * the server must never see it. It runs here precisely because it cannot be run
 * against the storefront whose Stripe is live.
 *
 * GATE 1 — SELF-DIFF. Capture the same unchanged target twice and require an
 * empty diff. This is the gate that decides whether the harness is worth
 * anything at all: a report that shows differences on a target nobody touched
 * trains its readers to skim, and then the one real finding is skimmed too. A
 * false green is worse than no check, and a noisy red is how a check becomes a
 * false green in practice.
 *
 * GATE 2 — PLANTED SIGNAL. Change one signal on one page — the
 * `<link rel="canonical">` href, and nothing else, not og:url, not the JSON-LD,
 * not one pixel — and require the harness to report exactly that, named. This
 * is the gate the naive screenshot harness fails.
 *
 * Both run in seconds, need no network and no Docker stack, and re-run on
 * demand. A real rehearsal host is swept separately (see README) to show the
 * same properties survive a real Next application.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./testserver/server";
import { slugFor } from "./lib/slug";
import type { DiffRow } from "./lib/diff";
import type { CaptureEntry } from "./lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const workDir = join(here, "..", "..", ".port-verify", "gate");
const planPath = join(here, "testserver", "plan.json");

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Spawn asynchronously, never `spawnSync`.
 *
 * The synthetic storefront runs in THIS process, so a synchronous child would
 * block the event loop that serves it and every request would time out. The
 * first version of this file did exactly that.
 */
function run(script: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", join(here, script), ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function capture(baseUrl: string, label: string): Promise<void> {
  const code = await run("capture.ts", [
    "--base-url",
    baseUrl,
    "--plan",
    planPath,
    "--out",
    join(workDir, label),
    "--label",
    label,
    "--concurrency",
    "2",
    "--min-interval-ms",
    "0",
  ]);
  if (code !== 0) {
    out(`FAIL: capture "${label}" exited ${code}`);
    process.exit(1);
  }
}

async function compare(
  before: string,
  after: string,
  name: string,
): Promise<DiffRow[]> {
  await run("compare.ts", [
    "--before",
    join(workDir, before),
    "--after",
    join(workDir, after),
    "--out",
    join(workDir, `report-${name}`),
    "--fail-on",
    "none",
  ]);
  const report = JSON.parse(
    readFileSync(join(workDir, `report-${name}`, "report.json"), "utf8"),
  ) as { rows: DiffRow[] };
  return report.rows;
}

function describe(rows: readonly DiffRow[]): string {
  return rows
    .map(
      (r) => `    [${r.group}] ${r.key} ${r.field}: ${r.before} -> ${r.after}`,
    )
    .join("\n");
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

let failures = 0;

function entryOf(label: string, path: string): CaptureEntry {
  return JSON.parse(
    readFileSync(
      join(workDir, label, "entries", `${slugFor(path)}.json`),
      "utf8",
    ),
  ) as CaptureEntry;
}

out("=== capturing the unchanged target twice ===");
const a = await startServer("a", 0);
await capture(a.url, "run-1");
await capture(a.url, "run-2");

/**
 * GATE 0 — the safety control, proved rather than asserted in prose.
 *
 * `/order-attempt` is a page that tries to place an order the moment it loads:
 * it carries a POST form and fires a POST from script. The capture must have
 * recorded the attempt and the server must never have seen it. This runs
 * against the synthetic storefront precisely because it cannot be run against
 * the one whose Stripe is live.
 */
out("=== GATE 0: the page tries to POST; the server must never see it ===");
const stats = (await (await fetch(`${a.url}/__stats`)).json()) as {
  mutations: number;
};
const attempt = entryOf("run-1", "/order-attempt");
const posted = attempt.blockedRequests.filter(
  (r: { method: string }) => r.method === "POST",
);
if (stats.mutations === 0 && posted.length > 0) {
  out(
    `GATE 0 PASS — ${posted.length} POST attempt(s) refused at the browser and recorded on the ` +
      `capture; the server logged 0 non-GET requests across both runs.`,
  );
} else {
  failures += 1;
  out(
    `GATE 0 FAIL — server saw ${stats.mutations} non-GET request(s); capture recorded ` +
      `${posted.length} blocked POST(s).`,
  );
}

out("");
out(
  "=== GATE 1: two runs against the same unchanged target must diff to nothing ===",
);
const selfRows = await compare("run-1", "run-2", "self");
if (selfRows.length === 0) {
  out("GATE 1 PASS — empty diff across two captures of an unchanged target.");
} else {
  failures += 1;
  out(`GATE 1 FAIL — ${selfRows.length} difference(s) on an unchanged target:`);
  out(describe(selfRows));
}

out("");
out("=== GATE 2: a planted canonical flip must be caught and named ===");
/**
 * ONE HOST, TWO POINTS IN TIME — the change is planted on the RUNNING server.
 *
 * This is the workflow the README documents as the headline and the one a real
 * port performs: the same origin serves different content before and after.
 * Restarting on a fresh ephemeral port instead handed the comparison two
 * different origins, which made every origin-bearing field undeterminable and
 * buried the planted flip under 58 rows describing the fixture rather than the
 * storefront — an artifact of how the gate spun up servers, never part of what
 * it tests.
 *
 * THIS IS NOT A PORT PIN. Nothing is suppressed: the assertion below is
 * unchanged, and a genuine origin change on a real pair still produces
 * `undetermined` rows exactly as designed (see `lib/diff.test.ts`, which
 * exercises that path directly).
 */
a.setVariant("b");
await capture(a.url, "run-3");
await a.close();

const plantedRows = await compare("run-1", "run-3", "planted");
/**
 * The flip is planted on ONE page, but three captured URLs resolve to it: the
 * nested URL itself, the flat URL that 308s onto it, and the legacy URL that
 * reaches it by a client-side navigation. All three must report the flip —
 * a harness that reported it on only the URL that was typed would miss it on
 * every store whose fixtures list the flat shape.
 */
const named = plantedRows.filter(
  (r) =>
    r.group === "indexing" &&
    r.field === "link rel=canonical" &&
    r.before === "{origin}/shop/kitchen/kettles/copper-kettle" &&
    r.after === "{origin}/products/copper-kettle",
);
const extra = plantedRows.filter((r) => !named.includes(r));

if (named.length > 0 && extra.length === 0) {
  out(
    `GATE 2 PASS — every reported difference is the planted canonical flip, named as one, on ` +
      `${named.length} URL(s): ${named.map((r) => r.key).join(", ")}`,
  );
  out(`  ${named[0]!.field}: ${named[0]!.before} -> ${named[0]!.after}`);
  out(
    `  zero pixel differences: the change is invisible to a screenshot, which is the point.`,
  );
} else {
  failures += 1;
  out(
    `GATE 2 FAIL — expected only canonical rows, got ${plantedRows.length} row(s):`,
  );
  out(describe(plantedRows));
}

out("");
if (failures === 0) {
  out("port-verify: all acceptance gates PASS");
  process.exit(0);
}
out(`port-verify: ${failures} acceptance gate(s) FAILED`);
process.exit(1);
