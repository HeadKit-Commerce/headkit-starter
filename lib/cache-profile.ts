/**
 * The storefront's cache PROFILE: how long a cached read is allowed to live
 * when no tag purge reaches it.
 *
 * Two profiles, one lever, per store:
 *
 *  - `conservative` (the default, and what every storefront does today) keeps
 *    each read's own finite lifetime — `hours` or `days` at nearly every call
 *    site. A purge is the fast path; the lifetime is the backstop that makes a
 *    MISSED purge self-heal on its own.
 *  - `aggressive` raises those same reads to `max` (revalidate 30d / expire
 *    365d). `max` has no useful timer underneath it, so a tag purge becomes the
 *    ONLY thing that refreshes an entry. On a store whose webhook plumbing is
 *    known-good that is the faster storefront — measured on one store, warm
 *    catalogue pages stop paying any origin read at all. On a store that drops
 *    a purge it is the difference between "stale for an hour" and "stale until
 *    somebody notices".
 *
 * So the profile is a per-store risk choice and NOT a platform default. It is
 * also strictly downstream of a working purge path: do not put a store on
 * `aggressive` unless its WordPress theme's revalidation webhooks are known to
 * reach the storefront (`docs/cache-revalidation-contract.md`).
 *
 * HOW A CALL SITE OPTS IN. Name both lifetimes instead of one:
 *
 *   cacheLifeForProfile("hours", "max");
 *
 * The conservative value stays visible at the call site, so the file still says
 * what the store gets by default, and the diff for the aggressive profile is
 * one argument rather than a rewritten constant. It CALLS `cacheLife` rather
 * than returning a value to pass to it, because `next build` generates one
 * single-literal overload per profile name and so rejects a variable holding a
 * union of two of them — the switch below is what keeps a literal at the call
 * Next sees. Calling indirectly is safe: `cacheLife` reads the enclosing
 * `"use cache"` entry from async storage, so a helper invoked inside that body
 * reaches the same entry a lexical call would.
 *
 * WHICH CALL SITES MUST NOT. A read whose result feeds an EXISTENCE or
 * STATUS-CODE decision keeps a plain literal and never goes through this
 * helper: serving a stale price is recoverable, pinning a wrong 404 or 308
 * until the next deploy is not. `lib/cache-profile-call-sites.test.ts` holds
 * that list and fails if one of them is wrapped.
 */

import { cacheLife } from "next/cache";

/** A built-in Next cache profile name, as `cacheLife` accepts it. */
export type CacheLifeProfileName =
  | "default"
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks"
  | "max";

/** The two storefront cache profiles. */
export type StorefrontCacheProfile = "conservative" | "aggressive";

/**
 * What a store gets with `HEADKIT_CACHE_PROFILE` unset — today's behaviour on
 * every storefront, and the only safe default for a store whose purge path has
 * not been verified.
 */
export const DEFAULT_CACHE_PROFILE: StorefrontCacheProfile = "conservative";

/**
 * This deployment's profile. Read once at module load: `cacheLife` runs inside
 * a `"use cache"` body during prerender and at request time alike, and the
 * value cannot change between them.
 *
 * `process.env` DIRECTLY rather than through `lib/env.ts`, which is where the
 * key is declared, documented and validated for the boot parse. Every
 * `cacheLife` call site in the storefront imports this module, so importing
 * the env module here would drag that whole Zod boot parse — and its required
 * store keys — into ~25 modules and their unit tests, none of which otherwise
 * need a configured storefront to render. {@link resolveCacheProfile} does the
 * narrowing this one key needs, and is tested directly.
 */
export const STOREFRONT_CACHE_PROFILE: StorefrontCacheProfile =
  resolveCacheProfile(process.env.HEADKIT_CACHE_PROFILE);

/**
 * Parse `HEADKIT_CACHE_PROFILE`. Anything unrecognised — including the empty
 * string a platform env editor writes for a "cleared" variable — resolves to
 * {@link DEFAULT_CACHE_PROFILE} rather than throwing: a typo in a store's
 * environment must not take its build down, and the failure it would otherwise
 * hide (silently caching forever) is the expensive direction.
 */
export function resolveCacheProfile(
  raw: string | undefined,
): StorefrontCacheProfile {
  return raw === "aggressive" || raw === "conservative"
    ? raw
    : DEFAULT_CACHE_PROFILE;
}

/**
 * An explicit lifetime, for a call site whose aggressive value cannot be a
 * named profile. `app/shop/page.tsx`'s root categories are the case: they keep
 * a 14-day `stale` that the named `max` profile would SHORTEN to 5 minutes, so
 * that site spells its lifetimes out field by field in both profiles.
 */
export interface CacheLifeSpec {
  stale?: number;
  revalidate?: number;
  expire?: number;
}

/**
 * Set this cached entry's lifetime, choosing by the store's profile.
 *
 * Call it in place of `cacheLife`, from inside the `"use cache"` body whose
 * lifetime it sets.
 */
export function cacheLifeForProfile(
  conservative: CacheLifeProfileName | CacheLifeSpec,
  aggressive: CacheLifeProfileName | CacheLifeSpec,
): void {
  applyCacheLife(
    STOREFRONT_CACHE_PROFILE === "aggressive" ? aggressive : conservative,
  );
}

/**
 * Hand one lifetime to `cacheLife`.
 *
 * The switch exists for the type checker, not for the runtime: `next build`
 * generates a separate single-literal overload per profile name, so a variable
 * typed as a union of names satisfies none of them. Spelling each case out is
 * what keeps the profile name a literal at the call Next type-checks, without
 * hard-coding the timings those names resolve to — which stay Next's own, and
 * stay overridable per store through `next.config.ts`'s `cacheLife` config.
 */
function applyCacheLife(life: CacheLifeProfileName | CacheLifeSpec): void {
  if (typeof life !== "string") {
    cacheLife(life);
    return;
  }
  switch (life) {
    case "default":
      cacheLife("default");
      return;
    case "seconds":
      cacheLife("seconds");
      return;
    case "minutes":
      cacheLife("minutes");
      return;
    case "hours":
      cacheLife("hours");
      return;
    case "days":
      cacheLife("days");
      return;
    case "weeks":
      cacheLife("weeks");
      return;
    case "max":
      cacheLife("max");
      return;
  }
}
