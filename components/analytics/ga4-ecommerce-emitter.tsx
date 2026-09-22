"use client";

import { useEffect } from "react";
import {
  pushGa4Ecommerce,
  pushGa4EcommerceOnce,
  type Ga4EcommerceEvent,
} from "@/lib/ga4-ecommerce";

interface Props {
  /**
   * The finished event, built on the SERVER by one of the domain builders in
   * `lib/ga4-ecommerce.ts`. Passing a built payload rather than the cart/order
   * keeps every mapping decision in that one module — this component only
   * pushes. `null` renders nothing, which is how an empty cart or an
   * unreadable order opts out.
   */
  event: Ga4EcommerceEvent | null;
  /**
   * When set, the event is pushed at most once per tab session under this key.
   * Required for `purchase`: the confirmation route renders more than once per
   * order (a session-processing pass redirects to a clean URL, and the shopper
   * can reload or return to the page), and each render is another mount.
   */
  dedupeKey?: string;
}

/**
 * Pushes one prepared GA4 ecommerce event into `dataLayer` on mount.
 *
 * Client-only by construction — the push helper returns before touching
 * `window` during SSR, and the effect never runs on the server.
 */
export function Ga4EcommerceEmitter({ event, dedupeKey }: Props): null {
  // Depend on the serialized payload, not the object: a server component hands
  // this a structurally-identical but referentially-new object on every render,
  // which would re-fire the effect on each one.
  const payload = event ? JSON.stringify(event) : null;

  useEffect(() => {
    if (!payload) return;
    const parsed = JSON.parse(payload) as Ga4EcommerceEvent;
    if (dedupeKey) {
      pushGa4EcommerceOnce(dedupeKey, parsed);
      return;
    }
    pushGa4Ecommerce(parsed);
  }, [payload, dedupeKey]);

  return null;
}
