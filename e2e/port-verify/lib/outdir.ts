/**
 * Output-directory preparation.
 *
 * Both CLIs take `--out` and both clear it before writing, so a mistyped path
 * would otherwise delete whatever is there. That is the first thing this
 * enforces, and it is absolute: a non-empty directory carrying none of this
 * tool's markers is never deleted, and no flag unlocks it.
 *
 * The second thing is newer and is specific to `capture.ts`. A "before" capture
 * is a ONE-SHOT artifact: once the port has landed, the pre-port state does not
 * exist anywhere to be recaptured, and the whole value of this instrument is
 * the comparison against it. So a COMPLETE capture directory is protected
 * behind `--overwrite`, while a PARTIAL one — a capture this tool started and
 * did not finish — is cleared freely.
 *
 * THAT SPLIT IS THE POINT OF THE DESIGN, not an accident of it. `--overwrite`
 * must never become a reflex: an operator who has to pass it on every ordinary
 * retry ends up with it in shell history, and then it is sitting on the command
 * that destroys the baseline too. Clearing a partial capture with no ceremony
 * is what keeps the flag rare enough to still mean something.
 *
 * `compare.ts` stays permissive and passes `overwrite: true` unconditionally.
 * The asymmetry is deliberate: a report is fully reproducible from the two
 * captures it was built from, so nothing there is irreplaceable.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** What `prepareOutputDir` found and did. */
export type OutputDirOutcome =
  | "created"
  | "cleared-empty"
  | "cleared-partial"
  | "cleared-complete";

/** How one CLI wants its `--out` directory treated. */
export interface OutputDirPolicy {
  /** The option name, for error messages. */
  readonly flag: string;
  /**
   * File written LAST by a successful run. Its presence therefore means the
   * directory holds a run that reached the end, not one that died partway.
   */
  readonly completeMarker: string;
  /**
   * Subdirectories the tool creates while running. Present WITHOUT the
   * complete marker, they identify a run this tool started and did not finish.
   */
  readonly partialMarkers: readonly string[];
  /** Whether a COMPLETE directory may be cleared. Never unlocks an unowned one. */
  readonly overwrite: boolean;
  /** Appended to the refusal, saying what is about to be destroyed and why it matters. */
  readonly completeWarning: string;
}

function hasPartialMarker(abs: string, markers: readonly string[]): boolean {
  return markers.some((m) => {
    const candidate = join(abs, m);
    return existsSync(candidate) && statSync(candidate).isDirectory();
  });
}

/**
 * Clear and create `dir` under the policy, refusing anything it must not delete.
 *
 * Returns which of the four cases applied, so the caller can say out loud that
 * it cleared a partial run rather than doing it silently.
 */
export function prepareOutputDir(
  dir: string,
  policy: OutputDirPolicy,
): OutputDirOutcome {
  const abs = resolve(dir);
  if (!existsSync(abs)) {
    mkdirSync(abs, { recursive: true });
    return "created";
  }

  const contents = readdirSync(abs);
  if (contents.length === 0) {
    mkdirSync(abs, { recursive: true });
    return "cleared-empty";
  }

  if (existsSync(join(abs, policy.completeMarker))) {
    if (!policy.overwrite) {
      throw new Error(
        `port-verify: ${policy.flag} ${abs} already holds a COMPLETE capture (${policy.completeMarker}).\n` +
          `  ${policy.completeWarning}\n` +
          `  Re-run with --overwrite to replace it, or point ${policy.flag} at a different directory.`,
      );
    }
    rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
    return "cleared-complete";
  }

  if (hasPartialMarker(abs, policy.partialMarkers)) {
    rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
    return "cleared-partial";
  }

  // ABSOLUTE, and `--overwrite` does not reach here. This is the mistyped-path
  // guard: a directory carrying none of this tool's markers is somebody else's
  // work, and no flag on this tool is allowed to be the reason it is deleted.
  throw new Error(
    `port-verify: ${policy.flag} ${abs} is a non-empty directory that this tool did not write ` +
      `(no ${policy.completeMarker}, no ${policy.partialMarkers.join("/")} subdirectory). ` +
      `Refusing to delete it — point ${policy.flag} at a new or previously written directory. ` +
      `--overwrite does not override this.`,
  );
}
