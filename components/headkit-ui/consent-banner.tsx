"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  CONSENT_ALL_DENIED,
  CONSENT_ALL_GRANTED,
  CONSENT_REOPEN_HREF,
  type ConsentChoices,
  type ConsentDecision,
} from "@/lib/consent";
import {
  clearConsentBannerHeight,
  publishConsentBannerHeight,
} from "@/lib/consent-banner-offset";
import {
  readConsent,
  saveConsent,
  subscribeConsent,
} from "@/lib/consent-store";

/**
 * The cookie banner.
 *
 * NOT MOUNTED UNLESS THE MERCHANT TURNED THE GATE ON. The root layout renders
 * this only when `storeSettings.cookieConsentEnabled` is true, and
 * `DeferredThirdPartyScripts` gates the consent DEFAULT on the same flag. Both
 * halves move together on purpose: mounting the banner without the default
 * would ask a question nothing acts on, and pushing the default without the
 * banner would leave every visitor denied with no way to grant — which kills a
 * store's Google Ads measurement silently. `consent-gate.test.tsx` asserts
 * both directions.
 *
 * WHAT IT IS. A fixed bar at the bottom of the viewport, rendered only after
 * hydration, only when no decision is stored. Three things about its shape are
 * load-bearing and none of them is a style preference:
 *
 *  - **It renders nothing on the server and reads its state in an effect.**
 *    Consent must never be a request-time read — see `lib/consent.ts` and
 *    AGENTS.md on what a request-time read in the ROOT layout costs every
 *    route. The cost here is a moment after hydration before the bar appears,
 *    which is the correct trade.
 *  - **It is `position: fixed`, so it is out of flow and shifts nothing**, and
 *    because it paints after hydration it can never be the LCP element.
 *    Measured on the fork at CLS 0.0061 with the banner absent from every
 *    shift source.
 *  - **Refusing is exactly as easy as accepting.** "Decline" and "Accept" are
 *    the same size, in the same row, one press each. A banner where refusing
 *    is buried is a dark pattern; it is also the thing most likely to be
 *    noticed publicly. The quieter control is "Choose", which OPENS more
 *    choice rather than hiding the refusal.
 *
 * WHAT IT MUST NEVER DO: accept on a timer, on scroll, on an outside click, or
 * on any gesture that is not a press of the accept control. Besides being the
 * dishonest design, any of those puts the grant inside Lighthouse's
 * observation window and gives back the points the gate exists to win
 * (`lib/consent.ts` carries the measurement). There is deliberately no close
 * button and no ESC handler for the same reason — dismissing without choosing
 * would have to mean something, and the only honest meaning is "denied", which
 * is what not choosing already means.
 *
 * NO NEW DEPENDENCY. The reason this is built rather than bought is that every
 * hosted consent platform is itself a third-party script that wants to run
 * first in `<head>` — 37-123 KB transferred, measured on the fork — which is
 * the exact cost this storefront spends effort removing. So: no package, no
 * CDN, one small client component, and `Button` reused from the design system.
 *
 * THE RE-OPEN CONTROL. Any anchor in the document with `href="#cookie-settings"`
 * re-opens this panel, through ONE delegated listener. That means the footer
 * link costs no client code, and a merchant can add the same href as a
 * WordPress menu item with no deploy.
 */

type Props = {
  /** Where "how we use cookies" points. The store's WordPress policy page. */
  policyHref?: string;
};

/**
 * `undefined` on the hydration render — the server cannot know, and rendering
 * the banner into the server HTML would be both a mismatch and a layout
 * liability. The client's first post-hydration snapshot is the real answer.
 */
function serverConsentSnapshot(): ConsentDecision | null | undefined {
  return undefined;
}

const COPY = {
  title: "Cookies on this site",
  body: "We use cookies to run the store, and — only if you allow it — to measure how the site is used and to make our advertising relevant. You can change your mind at any time.",
  analytics: {
    label: "Measurement",
    hint: "How pages are found and used, so we can improve them.",
  },
  advertising: {
    label: "Advertising",
    hint: "Lets us see which ads lead to a sale, and show relevant ads elsewhere.",
  },
} as const;

export function ConsentBanner({
  policyHref = "/legal/privacy-policy",
}: Props): React.JSX.Element | null {
  // `useSyncExternalStore` rather than a read in an effect: it gives the
  // hydration render a deliberate `undefined` and the first client render the
  // real value, with no setState in an effect and no mismatch. `readConsent`
  // memoises, so the snapshot reference is stable.
  const decision = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    serverConsentSnapshot,
  );
  const [reopened, setReopened] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [draft, setDraft] = useState<ConsentChoices>(CONSENT_ALL_DENIED);
  // A ref CALLBACK into state, not a `useRef`: the element is what the
  // measuring effect depends on, and every branch that hides this banner does
  // so by returning `null`, which fires this with `null` and runs the cleanup
  // that removes the property. A `useRef` would give the effect nothing to
  // re-run on and would leave the offset behind after a press.
  const [bannerElement, setBannerElement] = useState<HTMLDivElement | null>(
    null,
  );

  useEffect(() => {
    if (!bannerElement) return;
    const publish = (): void =>
      publishConsentBannerHeight(bannerElement.offsetHeight);
    publish();
    // Re-measured rather than taken once: the action row wraps to a second
    // line on a narrow viewport, and "Choose what to allow" grows the bar by
    // the height of two checkbox rows. `ResizeObserver` is absent in jsdom, so
    // the single measurement above is the whole mechanism under test — which
    // is honest, since jsdom reports `offsetHeight` 0 and can see none of this
    // anyway.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(bannerElement);
    return () => {
      observer?.disconnect();
      clearConsentBannerHeight();
    };
  }, [bannerElement]);

  useEffect(() => {
    // The re-open control: ONE delegated listener claims every
    // `a[href="#cookie-settings"]` in the document, so the footer link and any
    // WordPress menu item pointing there cost no client code of their own.
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(`a[href="${CONSENT_REOPEN_HREF}"]`)) return;
      event.preventDefault();
      setDraft(readConsent()?.choices ?? CONSENT_ALL_DENIED);
      setShowChoices(true);
      setReopened(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const decide = useCallback((choices: ConsentChoices): void => {
    // The ONE write. `saveConsent` notifies the tag loader, which pushes the
    // `consent update` when the container has already loaded.
    saveConsent(choices);
    setReopened(false);
    setShowChoices(false);
  }, []);

  // `undefined` = the hydration render; `null` = read, nothing stored.
  if (decision === undefined) return null;
  if (decision !== null && !reopened) return null;

  const showingChoices = showChoices;

  return (
    <div
      // `z-[45]`, not `z-40`: the PDP sticky add-to-cart bar is `z-40` and they
      // share the bottom edge. The offset keeps them from overlapping at rest;
      // this keeps the banner on top during the bar's 300 ms slide and if a
      // future bar grows taller than its own offset. It must NEVER be the only
      // half of the fix — see `lib/consent-banner-offset.ts`.
      className="headkit-consent-banner fixed inset-x-0 bottom-0 z-[45] border-t border-black/10 bg-white/95 backdrop-blur-sm"
      ref={setBannerElement}
      role="region"
      aria-label={COPY.title}
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="headkit-consent-copy max-w-[760px] text-sm leading-relaxed text-gray-800">
          <p className="mb-1 font-medium text-gray-950">{COPY.title}</p>
          <p>
            {COPY.body}{" "}
            <a
              href={policyHref}
              className="underline underline-offset-2 hover:text-primary"
            >
              Privacy policy
            </a>
            {showingChoices ? null : (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setShowChoices(true)}
                  className="cursor-pointer underline underline-offset-2 hover:text-primary"
                >
                  Choose what to allow
                </button>
              </>
            )}
          </p>

          {showingChoices ? (
            <fieldset className="headkit-consent-choices mt-3 flex flex-col gap-2 border-0 p-0">
              <legend className="sr-only">Choose what to allow</legend>
              <ChoiceRow
                id="consent-analytics"
                label={COPY.analytics.label}
                hint={COPY.analytics.hint}
                checked={draft.analytics}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, analytics: next }))
                }
              />
              <ChoiceRow
                id="consent-advertising"
                label={COPY.advertising.label}
                hint={COPY.advertising.hint}
                checked={draft.advertising}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, advertising: next }))
                }
              />
              <p className="text-xs text-gray-600">
                Cookies needed to run the store — your cart, your session, fraud
                protection — are always on and cannot be turned off.
              </p>
            </fieldset>
          ) : null}
        </div>

        {/*
          Decline and Accept are the same size and sit side by side: refusing
          must be exactly as easy as accepting.

          RIGHT-ALIGNED, and here that is a DEFAULT rather than a measurement.
          On the store this was ported from, `justify-end` was load-bearing:
          that store floats a chat widget in the bottom-LEFT corner above this
          bar, and a left-aligned row put the first control under the bubble at
          412 px. The platform cannot inherit that reason — it assumes no
          widget — so the alignment is kept for a different and weaker one: on
          desktop the enclosing `lg:justify-between` already puts this block at
          the right, and `justify-end` keeps a wrapped second line agreeing with
          it instead of splitting the row's alignment.

          No alignment is safe for every store, because the collision is with
          whatever the store floats in a bottom corner, and most chat widgets
          default to bottom-RIGHT. A store with one should flip this row via
          the `.headkit-consent-actions` hook in `overrides/styles.css` rather
          than editing this file. Any future control added here goes to the
          right of the others.
        */}
        <div className="headkit-consent-actions flex shrink-0 flex-wrap items-center justify-end gap-3">
          {showingChoices ? (
            <Button
              variant="outline"
              onClick={() => decide(draft)}
              className="min-w-[132px]"
            >
              Save choices
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => decide(CONSENT_ALL_DENIED)}
            className="min-w-[132px]"
          >
            Decline
          </Button>
          <Button
            variant="default"
            onClick={() => decide(CONSENT_ALL_GRANTED)}
            className="min-w-[132px]"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <label
      htmlFor={id}
      className="headkit-consent-choice flex cursor-pointer items-start gap-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span>
        <span className="font-medium text-gray-950">{label}</span>{" "}
        <span className="text-gray-600">— {hint}</span>
      </span>
    </label>
  );
}
