import { connection } from "next/server";

/**
 * Opts every route into request-time `generateMetadata` (ENG-868 / ENG-876).
 *
 * The HTML `robots` meta is decided by the request HOST, so metadata cannot be
 * baked into a prerendered shell that is served for every host. Under Cache
 * Components a route whose metadata reads a runtime input FAILS the build
 * ("Next.js encountered uncached or runtime data in `generateMetadata()`")
 * unless the route also has a dynamic hole; this marker is that hole, rendered
 * from the root layout inside `<Suspense>` so it covers all routes at once.
 *
 * It renders nothing. The static shell is still prerendered — only the marker
 * and the metadata resolve per request — which is the price of a `robots` tag
 * that can tell a rehearsal host from the customer's live one. `export const
 * dynamic` is not an option here: Cache Components rejects it, and
 * `connection()` is the documented replacement.
 *
 * WHAT THAT PRICE IS, MEASURED (Next 16.3 production build, 2026-09-10; the
 * numbers and the method are in "Request-time metadata costs the function
 * resume, not cache lookups" in `apps/starter/AGENTS.md`):
 *
 * - It is NOT a cache lookup. `generateMetadata` reads `getBranding()` and
 *   `getBrandingAssets()` (`"use cache: remote"`), and it is tempting to read
 *   the per-request tail as "two Runtime Cache round trips". It is zero. The
 *   prerender's postponed state carries the Resume Data Cache — every
 *   `use cache` entry the prerender read, remote ones included — the platform
 *   POSTs that state back to the function on each resume, and `use cache`
 *   consults it BEFORE any cache handler. On every route family the warm
 *   request made 0 handler `get`s for these two keys. Moving the reads out of
 *   metadata therefore removes nothing; the same keys are also read by the
 *   layout body in the same request and de-duplicated with it.
 * - It IS the function resume itself: one invocation per HIT that re-renders
 *   the RSC tree from the postponed state and streams the holes — metadata,
 *   this marker, and the route's other holes (locally 4–6 per route). Nothing
 *   inside `generateMetadata` can shorten that; only a route with NO dynamic
 *   hole at all is served without a function.
 * - It cannot be split. A `generateMetadata` result is one object: it is
 *   either wholly prerenderable or wholly deferred (Next 16.3 bundled docs,
 *   `generate-metadata.md`, "With Cache Components"). A host-dependent
 *   `robots` tag inside it therefore keeps `<title>`, canonical and OG out of
 *   the shell too. Two shapes that would change that were evaluated for
 *   PR #470 and REJECTED: emitting the host gate as a rendered
 *   `<meta name="robots">` from this hole (metadata joins the shell, the
 *   function still runs, and a rehearsal host carries two robots metas that
 *   port-verify reports as a finding), or as an `X-Robots-Tag` header from
 *   `proxy.ts` with this marker removed (the HTML tag stops being
 *   host-dependent, which is the ENG-868 / ENG-876 constraint). Both are
 *   decisions about what a non-indexable host emits, not refactors; the
 *   second is lever 11 of the scout report and is weighed separately.
 */
export async function DynamicMetadataMarker(): Promise<null> {
  await connection();
  return null;
}
