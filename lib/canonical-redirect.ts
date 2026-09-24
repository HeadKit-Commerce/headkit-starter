import "server-only";
import { canonicalCollectionRedirect } from "@/lib/collection-canonical";
import { canonicalProductRedirect } from "@/lib/product-canonical";
import { COLLECTION_PATH_PREFIX } from "@/lib/route-prefixes";

/**
 * The canonical 308 target for a request PATH, or null when the path is
 * already canonical (or is not one of the two consolidating families).
 *
 * This exists for `proxy.ts`, which is the one layer that can see the query
 * string a 308 would otherwise drop. It delegates to the routes' own decision
 * functions rather than restating either rule: a proxy-side copy that
 * disagreed with the route would bounce a request between the two shapes
 * forever. See `lib/collection-canonical.ts` and `lib/product-canonical.ts`.
 *
 * Only `/products/...` and `/collections/...` are answered. Everything else is
 * null — this is not a general redirect table, and it must never become one.
 */
export async function canonicalRedirectForPath(
  pathname: string,
): Promise<string | null> {
  const segments = decodeSegments(pathname);
  if (!segments || segments.length < 2) return null;

  const [family, ...rest] = segments;
  if (family === "products") return canonicalProductRedirect(rest);
  if (family === COLLECTION_PATH_PREFIX)
    return canonicalCollectionRedirect(rest);
  return null;
}

/**
 * Path segments as the route's `params` would see them: split, empties
 * dropped, percent-decoded.
 *
 * `request.nextUrl.pathname` is ENCODED while `params` is decoded, and the
 * decision functions compare against paths built from decoded slugs — so
 * skipping the decode would make a slug carrying any escaped character
 * silently non-canonical. A malformed escape yields null (no redirect) rather
 * than throwing: an undecodable URL is not this module's problem to report.
 */
function decodeSegments(pathname: string): string[] | null {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}
