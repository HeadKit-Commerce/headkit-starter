"use client";

import { useEffect } from "react";

import {
  CONSENT_ALL_DENIED,
  consentSignals,
  pushConsentCommand,
} from "@/lib/consent";
import { readConsent, subscribeConsent } from "@/lib/consent-store";

type Props = {
  gtmId?: string | null | undefined;
  klaviyoPublicKey?: string | null | undefined;
  hubspotPortalId?: string | null | undefined;
  /**
   * The store's cookie-consent gate, from `storeSettings.cookieConsentEnabled`.
   *
   * ABSENT MEANS OFF, and off means the WHOLE gate is absent, not just the
   * banner: no `consent default` is pushed, so a store that never turned this
   * on behaves exactly as it did before the feature existed. Removing only the
   * banner would leave every visitor pinned at `denied` with no control that
   * could ever grant, and Google tags would stop firing silently — which shows
   * up as a conversion report going quiet, not as an error.
   */
  consentEnabled?: boolean | undefined;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Load marketing tags after the page is interactive and idle (or on first
 * user gesture). Keeps GTM / Klaviyo / HubSpot off the LCP / TBT critical path.
 *
 * A tiny dataLayer stub is installed immediately so early pushes are queued
 * until gtm.js arrives.
 *
 * CONSENT. When the store has the gate on, the Google consent default is
 * pushed INSIDE `load()`, immediately before the `gtm.start` message. It
 * composes with the deferral for free, because the default only has to precede
 * the container IN THE DATALAYER, not in wall-clock time — so the
 * `requestIdleCallback` / 4 s cap / first-gesture behaviour below is untouched,
 * and must stay that way; it is a deliberate Core Web Vitals decision. That
 * exact arrangement was measured at Best Practices 100 on the fork this was
 * ported from, with the tag request leaving at 953-1,028 ms without the gate
 * and 971-1,035 ms with it.
 *
 * Only GOOGLE is gated. Klaviyo and HubSpot set first-party cookies, cost no
 * Lighthouse point, and gating them would cost onsite identification — which
 * is how abandoned-cart flows attribute. That is a separate decision.
 *
 * A returning visitor's stored decision is pushed AS THE DEFAULT rather than
 * as a denied default followed by an update, so someone who already accepted
 * never has a denied window. A press that lands after `load()` reaches the
 * container as a `consent update` through the subscription below; a press that
 * lands before it needs nothing, because `load()` reads the store.
 */
export function DeferredThirdPartyScripts({
  gtmId,
  klaviyoPublicKey,
  hubspotPortalId,
  consentEnabled = false,
}: Props): null {
  useEffect(() => {
    if (!gtmId && !klaviyoPublicKey && !hubspotPortalId) return;

    let loaded = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const load = (): void => {
      if (loaded) return;
      loaded = true;
      cleanup();

      if (gtmId) {
        window.dataLayer = window.dataLayer ?? [];
        if (consentEnabled) {
          // MUST precede gtm.start in the dataLayer, and MUST be pushed as an
          // `arguments` object — pushing a plain array is a silent no-op that
          // sets the DoubleClick cookie anyway. `lib/consent.ts` carries the
          // measurement. The `gtm.start` push three lines below IS a plain
          // object literal and is correct as one.
          pushConsentCommand(
            window.dataLayer,
            "default",
            consentSignals(readConsent()?.choices ?? CONSENT_ALL_DENIED),
          );
        }
        window.dataLayer.push({
          "gtm.start": Date.now(),
          event: "gtm.js",
        });
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
        document.head.appendChild(s);
      }

      if (klaviyoPublicKey) {
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(klaviyoPublicKey)}`;
        document.body.appendChild(s);
      }

      if (hubspotPortalId) {
        const s = document.createElement("script");
        s.id = "hs-script-loader";
        s.async = true;
        s.src = `//js.hs-scripts.com/${encodeURIComponent(hubspotPortalId)}.js`;
        document.body.appendChild(s);
      }
    };

    const onGesture = (): void => {
      load();
    };

    const cleanup = (): void => {
      if (idleId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("scroll", onGesture, true);
    };

    // Queue stub immediately for GTM callers.
    if (gtmId) {
      window.dataLayer = window.dataLayer ?? [];
    }

    // A press that lands AFTER the container loaded reaches it as an update.
    // Before that, `load()` reads the store itself and pushes the decision as
    // the default — so there is deliberately nothing to do here in that case,
    // and pushing an update ahead of the default would be out of order.
    //
    // This unsubscribe is intentionally NOT part of `cleanup()`: `load()`
    // calls that to drop the idle timer and the gesture listeners, and a
    // subscription dropped there would mean no press after load ever reaches
    // the container. It is torn down with the effect instead.
    const unsubscribeConsent = consentEnabled
      ? subscribeConsent(() => {
          if (!loaded || !gtmId) return;
          const dataLayer = (window.dataLayer = window.dataLayer ?? []);
          pushConsentCommand(
            dataLayer,
            "update",
            consentSignals(readConsent()?.choices ?? CONSENT_ALL_DENIED),
          );
        })
      : null;

    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    window.addEventListener("scroll", onGesture, {
      once: true,
      capture: true,
      passive: true,
    });

    // Prefer idle; hard-cap so tags still fire without interaction.
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => load(), { timeout: 4000 });
    } else {
      timeoutId = setTimeout(load, 3500);
    }

    return () => {
      cleanup();
      unsubscribeConsent?.();
    };
  }, [gtmId, klaviyoPublicKey, hubspotPortalId, consentEnabled]);

  return null;
}
