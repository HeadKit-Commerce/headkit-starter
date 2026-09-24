import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

/**
 * No `generateMetadata` may perform an UNCACHED read.
 *
 * Under Cache Components an uncached or request-time read in `generateMetadata`
 * is legal only when the route also has a dynamic hole. The root layout used to
 * supply one to every route at once (`DynamicMetadataMarker`), so this whole
 * class of defect was invisible: the read still happened on every request, it
 * just did not fail the build. Removing that marker (see `lib/host-robots.ts`)
 * turned one such read — `sdk.brands.list()` in the brand-facet branch of
 * `app/collections/[...slug]` — into 189 failed prerenders on a real store, all
 * of them `/collections/**\/f/brand.*`.
 *
 * So the rule is now enforced here rather than discovered by a 25-minute build.
 *
 * SCOPE, because a guard that overclaims is worse than none. This is a SOURCE
 * scan of each `generateMetadata` body for direct provider calls. It catches
 * the shape that actually bit (`sdk.x.y()` / `headkit.x.y()` inline in the
 * function) and nothing else:
 *
 *  - it does NOT follow helpers, so an uncached read one call deep is invisible
 *    to it — `lib/*` readers are expected to carry their own `"use cache"`;
 *  - it does NOT see `fetch()`, a database client, or `searchParams`/`headers()`
 *    /`cookies()`/`connection()`. The request-time four are a different failure
 *    with a different remedy (a route-local marker, as
 *    `app/products/[...slug]` mounts);
 *  - it cannot tell a cached wrapper from an uncached one — it only requires
 *    that the provider is not reached DIRECTLY from the metadata function.
 *
 * The build is still the only place the real rule is enforced. This exists so
 * the common case fails in 200 ms instead of 25 minutes.
 */
describe("generateMetadata performs no direct provider reads", () => {
  const files = globSync("app/**/page.tsx", { cwd: process.cwd() });

  /**
   * The body of `generateMetadata`, or null when the file declares none.
   *
   * The parameter list has to be skipped FIRST. Every one of these routes
   * destructures (`generateMetadata({ params }: Props)`), so balancing braces
   * from the first `{` after the signature returns the destructuring PATTERN —
   * `"{ params }"` — and the scan then reads an empty body and passes for every
   * route. That is not hypothetical: this file shipped that way for one commit
   * and a deliberate mutation walked straight through it.
   */
  function metadataBody(source: string): string | null {
    const start = source.indexOf("export async function generateMetadata");
    if (start === -1) return null;

    // Walk the parameter list to its matching `)`, then take the next `{`.
    const paren = source.indexOf("(", start);
    if (paren === -1) return null;
    let parenDepth = 0;
    let afterParams = -1;
    for (let i = paren; i < source.length; i++) {
      if (source[i] === "(") parenDepth++;
      else if (source[i] === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          afterParams = i;
          break;
        }
      }
    }
    if (afterParams === -1) return null;

    const open = source.indexOf("{", afterParams);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) return source.slice(open, i + 1);
      }
    }
    return source.slice(open);
  }

  it("finds the routes it claims to check, and reads their real bodies", () => {
    // Two vacuity guards, because each covers a different way this file can
    // pass while checking nothing: the glob matching no route, and the parser
    // returning a destructuring pattern instead of a function body.
    const bodies = files
      .map((file) =>
        metadataBody(readFileSync(join(process.cwd(), file), "utf8")),
      )
      .filter((body): body is string => body !== null);

    expect(bodies.length).toBeGreaterThan(5);
    // A real body awaits something; `"{ params }"` does not.
    expect(
      bodies.filter((body) => body.includes("await")).length,
      "metadataBody is returning parameter patterns, not function bodies",
    ).toBeGreaterThan(5);
  });

  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const body = metadataBody(source);
    if (!body) continue;

    it(`${file} reads the provider only through a cached helper`, () => {
      const direct = [
        ...body.matchAll(/\b(?:sdk|headkit)\.[A-Za-z]+\.[A-Za-z]+\s*\(/g),
      ].map((match) => match[0]);

      expect(
        direct,
        `${file}: generateMetadata calls the provider directly (${direct.join(", ")}). ` +
          `Under Cache Components that is "uncached data in generateMetadata()" and ` +
          `fails the prerender of every path this route enumerates — it only ever ` +
          `appeared to work because the root layout used to give every route a ` +
          `dynamic hole. Read through a "use cache" helper instead (see ` +
          `getCachedProductBrand in lib/product-brand.ts), and tag it per ENTITY, ` +
          `not with an index tag.`,
      ).toEqual([]);
    });
  }
});
