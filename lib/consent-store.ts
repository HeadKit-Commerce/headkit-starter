/**
 * The browser half of the consent gate: the stored decision, and one
 * subscription so the tag loader learns about a press it did not make.
 *
 * Deliberately NOT a React context. Two unrelated components need this — the
 * banner (which writes) and `DeferredThirdPartyScripts` (which reads at load
 * time and must react to a later press) — and a provider wrapping them would
 * have to sit in the root layout around `{children}`, which is the one place
 * AGENTS.md forbids adding anything. A module-level store beside them costs no
 * tree position at all.
 *
 * Every function here touches `window`, so every caller must be in an effect
 * or an event handler. Nothing in this module may be imported by a server
 * component — see the "never read on the server" rule in `lib/consent.ts`.
 */

import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  parseStoredConsent,
  serializeConsent,
  type ConsentChoices,
  type ConsentDecision,
} from "@/lib/consent";

/** `undefined` = storage not read yet; `null` = read, and no decision stored. */
let cached: ConsentDecision | null | undefined;

const listeners = new Set<() => void>();

/**
 * The stored decision, or `null` when the visitor has not chosen.
 *
 * Storage failures (Safari private mode, a blocked third-party context, a
 * browser with site data turned off) resolve to `null` — "not chosen" — which
 * shows the banner again rather than assuming a grant. Asking twice is the
 * benign failure; assuming consent is not.
 */
export function readConsent(): ConsentDecision | null {
  if (cached !== undefined) return cached;
  let decision: ConsentDecision | null = null;
  try {
    decision = parseStoredConsent(
      window.localStorage.getItem(CONSENT_STORAGE_KEY),
    );
  } catch {
    decision = null;
  }
  cached = decision;
  return decision;
}

/**
 * Record a decision and notify every subscriber.
 *
 * The in-memory value is updated even when the write throws, so a visitor in a
 * storage-less browser is not re-asked within the same page view — they are
 * simply asked again on the next one, which is the correct degradation.
 */
export function saveConsent(choices: ConsentChoices): ConsentDecision {
  const decision: ConsentDecision = {
    version: CONSENT_VERSION,
    at: new Date().toISOString(),
    choices: { ...choices },
  };
  cached = decision;
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      serializeConsent(decision),
    );
  } catch {
    // Ignored on purpose: see the docblock.
  }
  for (const listener of [...listeners]) listener();
  return decision;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: drop the memo and every subscriber. */
export function resetConsentStoreForTests(): void {
  cached = undefined;
  listeners.clear();
}
