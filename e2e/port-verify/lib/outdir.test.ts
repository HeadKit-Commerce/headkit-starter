import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareOutputDir } from "./outdir";
import type { OutputDirPolicy } from "./outdir";

/** The capture.ts policy: a completed capture is protected, a partial one is not. */
function capturePolicy(overwrite: boolean): OutputDirPolicy {
  return {
    flag: "--out",
    completeMarker: "capture.json",
    partialMarkers: ["entries", "screens"],
    overwrite,
    completeWarning: "This may be a pre-port BASELINE capture.",
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pv-out-"));
}

describe("output directory preparation", () => {
  it("creates a directory that does not exist", () => {
    const dir = join(tempDir(), "fresh");
    expect(prepareOutputDir(dir, capturePolicy(false))).toBe("created");
    expect(existsSync(dir)).toBe(true);
  });

  it("clears an existing but empty directory", () => {
    const dir = tempDir();
    expect(prepareOutputDir(dir, capturePolicy(false))).toBe("cleared-empty");
    expect(existsSync(dir)).toBe(true);
  });
});

describe("a completed capture is evidence, not scratch space", () => {
  function completed(): string {
    const dir = tempDir();
    mkdirSync(join(dir, "entries"));
    writeFileSync(join(dir, "entries", "root.json"), "{}");
    // Written last by a successful run, so its presence means "ran to completion".
    writeFileSync(join(dir, "capture.json"), "{}");
    return dir;
  }

  it("refuses to replace it without --overwrite, and says why", () => {
    // Once the port has landed the pre-port state cannot be recaptured, so the
    // refusal has to explain what is about to be destroyed, not just name a flag.
    const dir = completed();
    expect(() => prepareOutputDir(dir, capturePolicy(false))).toThrow(
      /COMPLETE capture/,
    );
    expect(() => prepareOutputDir(dir, capturePolicy(false))).toThrow(
      /--overwrite/,
    );
    expect(() => prepareOutputDir(dir, capturePolicy(false))).toThrow(
      /BASELINE/,
    );
    expect(existsSync(join(dir, "capture.json"))).toBe(true);
    expect(existsSync(join(dir, "entries", "root.json"))).toBe(true);
  });

  it("replaces it when --overwrite is passed", () => {
    const dir = completed();
    expect(prepareOutputDir(dir, capturePolicy(true))).toBe("cleared-complete");
    expect(existsSync(join(dir, "capture.json"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });
});

describe("an unfinished capture needs no ceremony to clear", () => {
  it("clears entries/ or screens/ with no capture.json and no flag", () => {
    // A wedged or killed sweep holds nothing worth protecting, and requiring
    // --overwrite on an ordinary retry is what would make the flag a reflex.
    const dir = tempDir();
    mkdirSync(join(dir, "entries"));
    writeFileSync(join(dir, "entries", "half.json"), "{}");
    expect(prepareOutputDir(dir, capturePolicy(false))).toBe("cleared-partial");
    expect(existsSync(join(dir, "entries"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });

  it("recognises a screens/ directory the same way", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "screens"));
    expect(prepareOutputDir(dir, capturePolicy(false))).toBe("cleared-partial");
  });
});

describe("a directory this tool did not write is never deleted", () => {
  function foreign(): string {
    const dir = tempDir();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export {};");
    return dir;
  }

  it("refuses a mistyped --out", () => {
    expect(() => prepareOutputDir(foreign(), capturePolicy(false))).toThrow(
      /Refusing to delete/,
    );
  });

  it("still refuses when --overwrite is passed", () => {
    // The mistyped-path guard is absolute. --overwrite protects a baseline from
    // being replaced; it is not a general licence to delete.
    const dir = foreign();
    expect(() => prepareOutputDir(dir, capturePolicy(true))).toThrow(
      /Refusing to delete/,
    );
    expect(existsSync(join(dir, "src", "index.ts"))).toBe(true);
  });

  it("does not mistake a plain file named like a marker directory for a partial run", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "entries"), "not a directory");
    expect(() => prepareOutputDir(dir, capturePolicy(false))).toThrow(
      /Refusing to delete/,
    );
  });
});

describe("compare.ts stays permissive, deliberately", () => {
  it("replaces its own completed report with no flag", () => {
    // A report is fully reproducible from the two captures it was built from,
    // so there is no baseline here to protect.
    const dir = tempDir();
    writeFileSync(join(dir, "report.json"), "{}");
    writeFileSync(join(dir, "report.md"), "#");
    expect(
      prepareOutputDir(dir, {
        flag: "--out",
        completeMarker: "report.json",
        partialMarkers: ["images"],
        overwrite: true,
        completeWarning: "",
      }),
    ).toBe("cleared-complete");
    expect(existsSync(join(dir, "report.md"))).toBe(false);
  });
});
