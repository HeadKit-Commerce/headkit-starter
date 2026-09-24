import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The claim: `AuthProvider` — which `app/layout.tsx` mounts on EVERY route —
 * does not put the GraphQL SDK in the client bundle.
 *
 * `createClientSDK` drags the GraphQL client and every operation document with
 * it: 259,472 B decoded, measured as one chunk on the Bike Society fork's
 * deployed home page (2026-09-24). Only a signed-in session with a refresh
 * token ever calls it, and only shortly before its JWT expires, so it is
 * loaded from inside the refresh timer instead of at module scope.
 *
 * WHERE IT STOPS.
 *  - A SOURCE reading of one file. It cannot see a bundle, a chunk graph, or a
 *    served page; that the home page stops shipping the chunk is a BUILD claim
 *    and lives in the PR that introduced this.
 *  - It covers ONLY the root-layout provider. `recently-viewed.tsx` (no caller
 *    today — `e2e/pdp-variants.spec.ts` has the dead-code note) and
 *    `app/account/(private)/wishlist/page.tsx` are the other two CLIENT
 *    modules that reach the SDK statically, and both are deliberate: neither
 *    is on the root-layout graph, so neither reaches a route a guest can
 *    load, and the wishlist route needs the SDK anyway. `lib/sdk.ts` and its
 *    server-side callers are not in scope — they never cross to a client.
 */

const SOURCE = readFileSync(join(__dirname, "auth-context.tsx"), "utf8");

describe("auth-context keeps the GraphQL SDK out of the client bundle", () => {
  it("has no static import from @headkit/sdk", () => {
    const staticValueImport =
      /^import\s+(?!type\b)[^;]*?from\s+"@headkit\/sdk";/m.test(SOURCE);
    expect(
      staticValueImport,
      "a top-level value import of @headkit/sdk here ships ~259 KB of client JS on every route",
    ).toBe(false);
  });

  it("loads it dynamically instead, so the chunk is fetched only on a refresh", () => {
    expect(SOURCE).toMatch(/await import\("@headkit\/sdk"\)/);
  });
});
