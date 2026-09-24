/**
 * Vercel purge-API availability probe.
 *
 * `invalidateByTag` from `@vercel/functions` reads the purge API off the
 * per-request context the Vercel runtime injects, and **resolves silently when
 * there is none** (`@vercel/functions@3.9.9`, `purge/index.js`):
 *
 * ```js
 * const invalidateByTag = (tag) => {
 *   const api = getContext().purge;
 *   if (api) return api.invalidateByTag(tag);
 *   return Promise.resolve();            // ← no error, no signal
 * };
 * ```
 *
 * So the call itself cannot tell a purge that landed from one that did
 * nothing, and a caller that assumes the former has no way to find out it was
 * wrong. `app/api/revalidate/route.ts` must therefore probe the context ITSELF,
 * fall back to deletion when there is none, and record the answer.
 *
 * `getContext` is deliberately NOT imported from `@vercel/functions`: the
 * package's `exports` map publishes only `.`, `./headers`, `./oidc`,
 * `./db-connections` and `./middleware`, and the root `index.d.ts` re-exports
 * `invalidateByTag` but not `getContext`. A deep import of `./get-context`
 * would be `ERR_PACKAGE_PATH_NOT_EXPORTED`. What is read here instead is the
 * package's own one-line body, against the same **global registry symbol** —
 * `Symbol.for("@vercel/request-context")` is `SYMBOL_FOR_REQ_CONTEXT` in
 * `get-context.js`, and a registry symbol is identical across every copy of
 * the package in the process, so this cannot drift from what `invalidateByTag`
 * reads a microsecond later.
 *
 * Whether a given deployment's runtime populates `purge` at all is not
 * knowable from the package, the docs, or a local run — the symbol is set by
 * Vercel's runtime, never by the SDK. That is why the answer is surfaced as
 * the `purgeApi` field of the `/api/revalidate` log line and of
 * `GET /api/revalidate`, rather than assumed anywhere.
 *
 * Pure module — no I/O, no `process.env`, no `console`, no side effects.
 */

/** The global registry symbol Vercel's runtime hangs the request context on. */
const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

/** The subset of the context this module reads. */
interface VercelRequestContext {
  purge?: unknown;
}

/** The shape the runtime installs on `globalThis` under the symbol above. */
interface VercelRequestContextHolder {
  get?: () => VercelRequestContext | undefined;
}

/**
 * True when the Vercel runtime has handed this invocation a purge API, so a
 * call to `invalidateByTag` will actually reach the CDN rather than resolving
 * into nothing.
 *
 * FALSE locally, in `next dev`, in `next start`, and in every test — none of
 * those runtimes installs the symbol. That is correct, not a defect: the
 * caller's fallback then applies and the purge still lands, by deletion. It is
 * also what keeps the whole `invalidateByTag` path inert off Vercel.
 *
 * Never throws: a runtime that installs a `get` which itself throws must not be
 * able to fail an authenticated webhook, so the probe answers `false` and the
 * caller degrades to the deletion path. Fail towards slow, never towards wrong.
 */
export function hasPurgeApi(): boolean {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[
      SYMBOL_FOR_REQ_CONTEXT
    ] as VercelRequestContextHolder | undefined;
    return Boolean(holder?.get?.()?.purge);
  } catch {
    return false;
  }
}
