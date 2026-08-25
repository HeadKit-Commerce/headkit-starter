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

export function loadRun(dir: string): CaptureRun {
  const abs = resolve(dir);
  const metaPath = join(abs, "capture.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `port-verify: ${abs} is not a capture directory (no capture.json). Run capture.ts first.`,
    );
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as CaptureRunMeta;
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
