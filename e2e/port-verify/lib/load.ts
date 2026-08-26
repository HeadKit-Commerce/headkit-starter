/**
 * Loading a capture directory back off disk.
 *
 * Fails loudly on a directory that is missing, empty or written by a different
 * schema version. Comparing two runs of different shapes would produce a
 * difference list that describes the harness rather than the storefront.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAPTURE_SCHEMA_VERSION } from "./types";
import type { CaptureEntry, CaptureRun, CaptureRunMeta } from "./types";

/**
 * Fill in fields added to the meta record WITHOUT a schema bump.
 *
 * `NormalizeRule.paths` is the case this exists for. It was added with an
 * empty-means-everywhere default, which is exactly the historical behaviour, so
 * the capture schema deliberately did NOT move — a run written before it exists
 * is still a valid run and must still compare. But the TYPE says `paths` is
 * always present, and `loadRun` blind-casts the parsed JSON, so every reader
 * downstream is trusting a guarantee the file does not make. Two readers
 * currently defend with `?? []` and both keep doing so; the next one to trust
 * the type would throw on a pre-1.2.0 capture, and the failure would surface
 * far from the cast that caused it.
 *
 * So the default is applied ONCE, here at the boundary, which is the only place
 * that knows the record came off disk rather than out of `loadPlan`.
 */
function withDefaults(meta: CaptureRunMeta): CaptureRunMeta {
  return {
    ...meta,
    normalize: (meta.normalize ?? []).map((rule) => ({
      ...rule,
      paths: rule.paths ?? [],
    })),
  };
}

export function loadRun(dir: string): CaptureRun {
  const abs = resolve(dir);
  const metaPath = join(abs, "capture.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `port-verify: ${abs} is not a capture directory (no capture.json). Run capture.ts first.`,
    );
  }
  const meta = withDefaults(
    JSON.parse(readFileSync(metaPath, "utf8")) as CaptureRunMeta,
  );
  if (meta.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(
      `port-verify: ${abs} was written by capture schema ${meta.schemaVersion}, this build reads ` +
        `${CAPTURE_SCHEMA_VERSION}. Re-capture rather than comparing across schemas.`,
    );
  }
  const entriesDir = join(abs, "entries");
  if (!existsSync(entriesDir)) {
    throw new Error(`port-verify: ${abs} has no entries/ directory`);
  }
  const files = readdirSync(entriesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `port-verify: ${abs} contains zero captured URLs. Comparing it would report "no differences" ` +
        `over nothing at all.`,
    );
  }
  const entries = files.map(
    (f) =>
      JSON.parse(readFileSync(join(entriesDir, f), "utf8")) as CaptureEntry,
  );
  return { meta, entries, dir: abs };
}
