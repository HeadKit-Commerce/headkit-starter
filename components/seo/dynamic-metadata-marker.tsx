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
 * and the metadata resolve per request — so the cost is the streamed metadata,
 * which is the price of a `robots` tag that can tell a rehearsal host from the
 * customer's live one. `export const dynamic` is not an option here: Cache
 * Components rejects it, and `connection()` is the documented replacement.
 */
export async function DynamicMetadataMarker(): Promise<null> {
  await connection();
  return null;
}
