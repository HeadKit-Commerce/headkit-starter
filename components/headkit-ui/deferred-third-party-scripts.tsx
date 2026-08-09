"use client";

import { useEffect } from "react";

type Props = {
  gtmId?: string | null | undefined;
  klaviyoPublicKey?: string | null | undefined;
  hubspotPortalId?: string | null | undefined;
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
 */
export function DeferredThirdPartyScripts({
  gtmId,
  klaviyoPublicKey,
  hubspotPortalId,
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

    return cleanup;
  }, [gtmId, klaviyoPublicKey, hubspotPortalId]);

  return null;
}
