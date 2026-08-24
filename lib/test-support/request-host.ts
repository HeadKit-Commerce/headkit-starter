/**
 * Mutable request-Host stand-in for `next/headers` in unit tests.
 *
 * The indexing decision (lib/indexing-decision.ts) reads the request Host, so
 * both `robots.txt` and the HTML `robots` meta need a controllable host to be
 * testable. `null` models "no request scope" — the fail-closed case.
 */
let requestHost: string | null = null;

/** Sets the Host header returned to the mocked `headers()`; null = no scope. */
export function setRequestHost(host: string | null): void {
  requestHost = host;
}

/** Mocked `headers()` body: throws when no request scope has been set. */
export function currentRequestHeaders(): Headers {
  if (requestHost === null) {
    throw new Error("headers() called outside a request scope");
  }
  return new Headers({ host: requestHost });
}
