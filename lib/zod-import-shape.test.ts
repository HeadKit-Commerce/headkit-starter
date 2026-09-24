import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every zod import in the starter must be `import * as z from "zod"`.
 *
 * Zod v4's root entry re-exports a namespace BINDING — `node_modules/zod/index.js`
 * is `import * as z from "./v4/classic/external.js"; export { z, z as default }`
 * — and `external.js` itself carries `export * as locales from
 * "../locales/index.js"` plus the JSON-Schema processors. Taking the `z`
 * binding therefore retains the whole `external.js` namespace OBJECT, because
 * a bundler cannot prove which members of a namespace value get read.
 * Importing the module namespace directly restores per-member reachability.
 *
 * ONE named import anywhere in the client graph is enough to pull all of it
 * back, because every zod consumer in this app lands in the same shared chunk
 * — which is why this is asserted over the whole tree rather than per file.
 *
 * `eslint.config.mjs` carries the same rule as `no-restricted-syntax`, which
 * is the better place for it. This test exists beside it because `bun run
 * lint` runs with `--max-warnings 999` over a tree that already reports
 * warnings, so the lint rule alone is easy to lose.
 *
 * WHAT THIS CANNOT SEE: it reads SOURCE TEXT. It observes no chunk, no byte
 * count, and nothing a bundler actually shook out — a future zod release could
 * make both import forms identical, or neither shakeable, and this would stay
 * green either way. It also does not cover a deep import
 * (`zod/v4/classic/...`), `zod/mini`, a re-export of `z` through another
 * module, or any directory outside the four roots below.
 */

const ROOT = path.join(__dirname, "..");
const SOURCE_ROOTS = ["app", "components", "lib", "hooks"] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = SOURCE_ROOTS.flatMap((r) => sourceFiles(path.join(ROOT, r)));

/** `import { z } from "zod"` / `import z from "zod"`, single or double quoted. */
const NAMED_OR_DEFAULT_ZOD_IMPORT =
  /^\s*import\s+(?:\{[^}]*\bz\b[^}]*\}|z)\s+from\s+["']zod["']/m;

describe("zod is imported as a module namespace", () => {
  it("finds source files to check", () => {
    // Without this the sweep below would be green on an empty file list.
    expect(FILES.length).toBeGreaterThan(100);
    expect(
      FILES.filter((f) =>
        /import \* as z from "zod"/.test(readFileSync(f, "utf8")),
      ).length,
      "No file imports zod at all, so this guard is proving nothing.",
    ).toBeGreaterThan(0);
  });

  it("no file takes the named or default `z` binding", () => {
    const offenders = FILES.filter((f) =>
      NAMED_OR_DEFAULT_ZOD_IMPORT.test(readFileSync(f, "utf8")),
    ).map((f) => path.relative(ROOT, f));

    expect(
      offenders,
      `These files import zod's \`z\` binding, which drags zod's full locale ` +
        `set and JSON-Schema surface into the shared client chunk for every ` +
        `route that loads any form code. Use \`import * as z from "zod"\` — ` +
        `the call sites need no other change. See this file's header and the ` +
        `matching rule in eslint.config.mjs.`,
    ).toEqual([]);
  });
});
