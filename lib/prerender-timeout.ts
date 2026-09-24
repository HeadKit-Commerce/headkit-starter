/**
 * The prerender budget a build gives ONE page, and — through it — a
 * `"use cache"` fill inside that page's prerender.
 *
 * THE LEVER IS NOT THE KEY NAMED AFTER IT. In Next 16.3 the effective fill
 * budget during a prerender is
 *
 *   Math.min(experimental.useCacheTimeout, staticPageGenerationTimeout * 0.9)
 *
 * (`server/use-cache/use-cache-wrapper.js`, `getUseCacheFillTimeoutMs`), and
 * `experimental.useCacheTimeout` itself DEFAULTS to
 * `staticPageGenerationTimeout * 0.9` (`server/config.js`). So raising
 * `useCacheTimeout` alone is inert in a build — the clamp holds it at 54s
 * (60 × 0.9) however large it is set. `staticPageGenerationTimeout` has to
 * move for anything to change. Measured against Next 16.3.4 on one store:
 * `useCacheTimeout: 392` alone left the effective budget at 54s; adding
 * `staticPageGenerationTimeout: 436` made it 392s.
 *
 * WHEN A STORE NEEDS THIS. A route that wraps a wide fan-out in a single
 * cached entry — `app/sitemap.ts` is the one in this template — fails the
 * build with `Filling a cache during prerender timed out` on that one path
 * while every other page prerenders cleanly. That is the symptom; this is the
 * only lever for it. Size it from the store's own fan-out, not from a round
 * number: count the origin reads one fill makes, divide by the SLOWEST share
 * of the origin rate limit the build's workers leave it (prerender workers
 * draw on the same bucket), add headroom, then divide by 0.9 for the page
 * budget. One store's arithmetic, for shape: 147 reads ÷ 0.60 req/s = 245s,
 * × 1.6 headroom = 392s of fill budget, ÷ 0.9 = 436s of page budget.
 *
 * WHAT RAISING IT COSTS, and why the platform default stays where it is.
 * `staticPageGenerationTimeout` is GLOBAL and is also the export worker's
 * per-page kill, retried up to 3 times on a timeout (`export/worker.js`). At
 * 436s a page that hangs OUTSIDE any `"use cache"` burns up to ~22 minutes
 * before it is reported, against a 45-minute build ceiling — so a genuine hang
 * fails later, and more expensively, than it does at Next's 60s default. A
 * stall INSIDE a cached function is unaffected: it still aborts at the fill
 * budget, which is why the fill budget stays below the page budget.
 */

/**
 * Next's own default page budget, in seconds. Unset
 * `HEADKIT_STATIC_PAGE_GENERATION_TIMEOUT` and the config omits both keys
 * entirely, so the build behaves exactly as it does today.
 */
export const NEXT_DEFAULT_PAGE_GENERATION_TIMEOUT_SECONDS = 60;

/** The factor Next clamps `useCacheTimeout` to. */
export const USE_CACHE_FILL_TIMEOUT_FACTOR = 0.9;

/** The two config keys a raised budget has to set TOGETHER to take effect. */
export interface PrerenderTimeoutConfig {
  staticPageGenerationTimeout: number;
  useCacheTimeout: number;
}

/**
 * Resolve `HEADKIT_STATIC_PAGE_GENERATION_TIMEOUT` into the pair of keys.
 *
 * `undefined` means "write neither key", which is not the same as writing
 * Next's own default back: leaving them out keeps this template's build
 * identical to today's for every store that has not measured a need.
 *
 * `useCacheTimeout` is restated explicitly at the value the clamp would
 * produce, so the intended budget survives a change to Next's 0.9 factor
 * rather than silently moving with it.
 */
export function resolvePrerenderTimeout(
  raw: string | undefined,
): PrerenderTimeoutConfig | undefined {
  if (raw === undefined || raw === "") return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (
    !Number.isFinite(seconds) ||
    seconds <= NEXT_DEFAULT_PAGE_GENERATION_TIMEOUT_SECONDS
  ) {
    // At or below Next's default there is nothing to raise, and a negative or
    // unparseable value must not become a build-wide 0s page budget.
    return undefined;
  }
  return {
    staticPageGenerationTimeout: seconds,
    useCacheTimeout: Math.floor(seconds * USE_CACHE_FILL_TIMEOUT_FACTOR),
  };
}
