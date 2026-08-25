import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_INTERACTION_APIS, isBlockedHost } from "./safety";
import { DEFAULT_BLOCKED_HOSTS } from "./plan";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The two files that name the forbidden APIs in order to forbid them. Excluded
 * by name rather than by a cleverer scan, so the exclusion is visible.
 */
const SELF_REFERENTIAL = ["lib/safety.ts", "lib/safety.test.ts"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("lint guard: no interaction API appears in this directory's source", () => {
  it("finds no forbidden Playwright interaction call in any .ts file here", () => {
    // WHAT THIS IS. A SOURCE-TEXT guard. It reads this directory's .ts files and
    // substring-matches FORBIDDEN_INTERACTION_APIS. It executes nothing.
    //
    // WHERE IT STOPS. Matching text is not behaviour. It cannot see
    // `el["cl" + "ick"]()` or any other indirection, and it fires on a
    // commented-out or otherwise dead occurrence. So it neither proves nor
    // disproves that the harness can interact with a page.
    //
    // WHY IT IS STILL HERE. Defence in depth, aimed at the next person
    // extending this harness: an ordinary edit that adds `page.fill()` to a
    // capture pass fails the build instead of reaching review.
    //
    // WHAT ACTUALLY PROVES THE PROPERTY. GATE 0 in `gate.ts` — the
    // `/order-attempt` page carries a POST form and fires a POST from script on
    // load; the capture must record the attempt and the server must log zero
    // non-GET requests. That is the control. This is the tripwire.
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      const rel = relative(root, file);
      if (SELF_REFERENTIAL.includes(rel)) continue;
      const source = readFileSync(file, "utf8");
      for (const api of FORBIDDEN_INTERACTION_APIS) {
        if (source.includes(api)) offenders.push(`${rel} uses ${api}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("payment hosts are unreachable from the browser context", () => {
  it("blocks every payment host and their subdomains", () => {
    expect(isBlockedHost("js.stripe.com", DEFAULT_BLOCKED_HOSTS)).toBe(true);
    expect(isBlockedHost("edge.js.stripe.com", DEFAULT_BLOCKED_HOSTS)).toBe(
      true,
    );
    expect(isBlockedHost("JS.STRIPE.COM", DEFAULT_BLOCKED_HOSTS)).toBe(true);
    expect(isBlockedHost("store.invalid", DEFAULT_BLOCKED_HOSTS)).toBe(false);
    // A host that merely ends with the same letters is not a subdomain.
    expect(
      isBlockedHost("notjs.stripe.com.evil.invalid", DEFAULT_BLOCKED_HOSTS),
    ).toBe(false);
  });
});
