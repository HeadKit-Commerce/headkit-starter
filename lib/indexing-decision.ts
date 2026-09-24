import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { isIndexableHost } from "@/lib/host-indexing";

/**
 * The host decision behind `robots.txt` (ENG-868 / ENG-876).
 *
 * `robots.txt` and the page's own indexing signal must never disagree: a
 * `Disallow: /` served next to a page that says `index, follow` still invites
 * indexing, because `Disallow` is a CRAWL directive — a URL discovered by a
 * link can be indexed on the strength of the page's own directives alone.
 *
 * The PAGE side of that pair no longer runs through here. It is now an
 * `X-Robots-Tag: noindex, nofollow` response header set in `proxy.ts`, which
 * makes the same host comparison against the same {@link isIndexableHost}
 * predicate — see `lib/host-robots.ts` for why it moved and what it cost to
 * leave it in `generateMetadata`. This function survives for `app/robots.ts`
 * alone, which reads the Host in process because it is a tiny uncached route
 * with no static shell to lose.
 *
 * Deliberately NOT keyed on `VERCEL_ENV`: a rehearsal storefront is a Vercel
 * *production* deployment served at a temporary `*.headkit.app` host, which is
 * exactly the case the host gate exists to close. See lib/host-indexing.ts.
 *
 * Fails CLOSED: an unavailable header store (no request scope) is treated as an
 * unknown host, and {@link isIndexableHost} already fails closed for a missing
 * or unparseable configured url, a missing Host, a subdomain, or a lookalike.
 *
 * Reading the Host header makes the caller dynamic, which is why `app/robots.ts`
 * carries no cache directive.
 *
 * @param configuredUrl the store's declared frontend origin, already resolved
 *   by the caller through `resolveSiteUrl` so it compares the same origin the
 *   header gate does. REQUIRED, and typed without `undefined`: an omitted origin used to
 *   fail closed silently, which turned a forgotten argument into a site-wide
 *   `noindex` that no type error and no assertion could catch. `null` and `""`
 *   still mean "the store declares no origin" and still fail closed.
 */
export async function isIndexableCurrentHost(
  configuredUrl: string | null,
): Promise<boolean> {
  if (configuredUrl === undefined) {
    throw new TypeError(
      "isIndexableCurrentHost: configuredUrl is required — pass the origin from resolveSiteUrl(storeDomain). Omitting it would silently noindex every page.",
    );
  }

  let currentHost: string | null;
  try {
    const requestHeaders = await headers();
    currentHost =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  } catch (error) {
    // Next signals "this render just became dynamic" by THROWING from the
    // dynamic APIs during prerender. Swallowing that turns a bailout into a
    // fabricated `noindex` on a live host; `unstable_rethrow` exists for
    // exactly this and passes ordinary errors through untouched.
    unstable_rethrow(error);
    return false;
  }
  return isIndexableHost(configuredUrl, currentHost);
}
