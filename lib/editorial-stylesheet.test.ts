import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import {
  EDITORIAL_STYLESHEET_HREF,
  editorialStylesheetHash,
} from "./editorial-stylesheet";

/**
 * The claim: the vendored WordPress block stylesheet is a content-addressed
 * static asset that exists, matches its own name, and is served `immutable`.
 *
 * WHERE IT STOPS. It reads files and the config object. It cannot see a served
 * response header, a `<link>` in real HTML, or which routes emit one — that a
 * commerce home page stops carrying the stylesheet while a prose page keeps it
 * is a BUILD/HTTP claim, measured in the PR that introduced this. Nor does it
 * prove the CSS is correct WordPress CSS; it is a vendor file.
 */

const APP = join(__dirname, "..");

describe("the editorial stylesheet is content-addressed", () => {
  it("exists at the href, and the href carries its own hash", () => {
    const css = readFileSync(join(APP, "public", EDITORIAL_STYLESHEET_HREF));
    const hash = editorialStylesheetHash(css);
    expect(
      EDITORIAL_STYLESHEET_HREF,
      `public${EDITORIAL_STYLESHEET_HREF} hashes to ${hash}. Rename the file to ` +
        `wp-block-library.${hash}.css and update EDITORIAL_STYLESHEET_HREF — ` +
        "next.config.ts serves this path `immutable`, so a changed file under " +
        "an unchanged name is served stale forever.",
    ).toBe(`/editorial/wp-block-library.${hash}.css`);
  });

  it("is still the WordPress block library, not an empty or truncated file", () => {
    const css = readFileSync(
      join(APP, "public", EDITORIAL_STYLESHEET_HREF),
      "utf8",
    );
    expect(css.length).toBeGreaterThan(100_000);
    expect(css.split("wp-block").length - 1).toBeGreaterThan(1_000);
  });

  it("is served immutable by next.config.ts", async () => {
    const headers = await nextConfig.headers!();
    const rule = headers.find((h) => h.source.startsWith("/editorial/"));
    expect(rule).toBeDefined();
    expect(rule!.headers.find((h) => h.key === "Cache-Control")?.value).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});

describe("nothing imports the stylesheet back into the module graph", () => {
  it("has no `block-library.css` import anywhere under app/components/lib/hooks", () => {
    // An `import "...block-library.css"` — dynamic ones included — is
    // collected from the module graph at BUILD time and lands on every route
    // that can reach it, whether the importing branch runs or not. That is
    // exactly the defect this replaced, so the absence is the guard.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith("."))
            continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && full !== __filename) {
          // An IMPORT specifier, static or dynamic — not a mention in prose.
          if (
            /import\s*\(?\s*["'][^"']*block-library[^"']*\.css["']/.test(
              readFileSync(full, "utf8"),
            )
          ) {
            offenders.push(full.slice(APP.length + 1));
          }
        }
      }
    };
    for (const dir of ["app", "components", "lib", "hooks"]) {
      walk(join(APP, dir));
    }
    expect(
      offenders,
      `these files reference block-library.css: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
