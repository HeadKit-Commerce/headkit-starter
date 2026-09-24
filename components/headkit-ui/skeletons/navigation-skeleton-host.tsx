"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  NavigationSkeleton,
  NAVIGATION_SKELETON_DELAY_MS,
  useDelayedFlag,
} from "@/components/headkit-ui/skeletons/navigation-skeleton";
import {
  clearNavigationSkeleton,
  getNavigationSkeletonRequest,
  getServerNavigationSkeletonRequest,
  subscribeNavigationSkeleton,
} from "@/lib/navigation-skeleton-store";

/**
 * How long a request may stay live before the host gives up on it.
 *
 * Not a timeout on the navigation — the route-change exit below ends almost every
 * request long before this — but the answer to "what if nothing ever reports
 * back". A skeleton stuck over a page forever is a worse failure than the one this
 * feature exists to fix, and the case it covers is narrow: a requester that was
 * unmounted by its container AND a navigation that never changes the pathname (a
 * query-only link inside a dismissible container), or a navigation the router
 * abandoned.
 *
 * 15 s, because the ceiling must sit clear of a genuinely slow navigation: a
 * never-prerendered collection facet was measured at 8.2-10.0 s, so anything at or
 * under ten seconds would cut off a wait that was still working.
 */
export const NAVIGATION_SKELETON_MAX_MS = 15_000;

/**
 * Watch a live request until the route has committed, then run `done`.
 *
 * ONE QUESTION, ASKED OF THE LIVE DOM: has the router landed — is
 * `location.pathname` no longer where we started, or already the destination? An
 * rAF loop asks it, so polling runs only while a request exists (at most the
 * ceiling above) and costs nothing when nothing is navigating.
 *
 * THE SKELETON COMES DOWN AT COMMIT, IMAGES OR NO IMAGES, and the trade-off is
 * stated: pictures may still be arriving when the cover comes off, and they will
 * pop in afterwards.
 *
 * That is not the same thing as uncovering an EMPTY page, and the distinction is
 * what makes it safe. An earlier revision of this feature on the fork waited for
 * first paint because the shopper saw old page → skeleton → BLANK → the page. The
 * blank came from uncovering markup with nothing drawn in it — but at route commit
 * the markup IS in the DOM: measured on the fork's mega-menu gesture, the product
 * anchors entered the DOM at 5,454 ms while the first image only finished at
 * 7,404 ms. So uncovering at commit hands the shopper text and layout immediately
 * with the pictures filling in, which is ordinary web behaviour rather than a blank
 * frame. What the paint wait bought, and what was given up here, was ~1.9 s of
 * skeleton held over a page the shopper could already have been reading.
 *
 * Do not reintroduce a wait for images "to be safe": the hold it creates is the
 * cost, and it was measured. The one thing that must stay true is that commit
 * implies markup on the route — if a future route commits empty, fix that route,
 * not this file.
 *
 * Returns its own cleanup, so a second navigation started mid-flight cancels the
 * first one's watch instead of clearing the new request out from under it.
 */
function watchRequest(
  request: { fromPathname: string; toPathname: string | null },
  done: () => void,
): () => void {
  let cancelled = false;
  const finish = (): void => {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(cap);
    done();
  };
  // The cap is a timer rather than a clock read inside the poll, so it is one
  // scheduled thing a test can advance — and so a tab that stops servicing
  // animation frames in the background still releases the cover.
  const cap = setTimeout(finish, NAVIGATION_SKELETON_MAX_MS);

  // Has the navigation landed? Read from `location`, not from a hook — see the
  // component docblock below for the build failure that forces this.
  const landed = (): boolean => {
    const here = window.location.pathname;
    return here !== request.fromPathname || here === request.toPathname;
  };

  const check = (): void => {
    if (cancelled) return;
    if (!landed()) {
      requestAnimationFrame(check);
      return;
    }
    finish();
  };

  requestAnimationFrame(check);
  return () => {
    cancelled = true;
    clearTimeout(cap);
  };
}

/**
 * The ONE place a pending-navigation skeleton is rendered.
 *
 * Mounted once, in the root layout, beside the cart drawer — inside the providers
 * and OUTSIDE `{children}`. That position is the whole point: it survives every
 * client navigation and every dismissible container, so a skeleton asked for by a
 * link in a mega-menu, a mobile sheet, the search drawer or the cart drawer keeps
 * rendering after that link is gone. See `lib/navigation-skeleton-store.ts` for
 * the measurement that forces this.
 *
 * It adds no `<Suspense>` and makes no request-time read, so the status-code rule
 * in `AGENTS.md` ("Setting a status code needs THREE conditions") is untouched —
 * in particular its condition 2, that the root layout must never wrap `{children}`
 * in a boundary.
 *
 * IT READS THE PATH FROM `location`, NEVER FROM `usePathname()`, and that is a
 * correction a production build had to teach on the fork. Next treats
 * `usePathname()` as URL DATA during prerender, and on a route whose params are
 * not enumerated it suspends:
 *   Route "/account/orders/[orderId]": Next.js encountered URL data
 *   `usePathname()` in a Client Component outside of <Suspense>.
 * This repo already knew, in `app/account/(private)/layout.tsx` — that layout
 * isolates its own `usePathname()` below an explicit `<Suspense>` for exactly this
 * reason, and says so. A hook in the ROOT layout is above every route and cannot
 * be given a boundary, because a boundary there re-opens the soft 404.
 *
 * So the landing check reads `window.location.pathname` from inside an effect. An
 * effect never runs during prerender, so it is not a read Next can see. Nothing
 * here calls `useSearchParams()` either.
 *
 * On the server this renders null — `getServerNavigationSkeletonRequest` — so the
 * prerendered HTML is byte-for-byte what it was and the 404 / 308 gates never see
 * it.
 */
export function NavigationSkeletonHost(): React.JSX.Element | null {
  const request = useSyncExternalStore(
    subscribeNavigationSkeleton,
    getNavigationSkeletonRequest,
    getServerNavigationSkeletonRequest,
  );
  // The exits, both of them inside one watcher.
  //
  // A route change is the real one: it means the navigation this skeleton was
  // covering has landed, and it works whether or not the requester still exists.
  // It is also why the request carries the path it started from rather than the
  // host diffing its own previous render — the host may not have rendered since,
  // and a remembered "previous" would be wrong after any unrelated navigation.
  // The 15 s ceiling is the other, for a navigation that never lands at all.
  useEffect(() => {
    if (request === null) return;
    return watchRequest(request, clearNavigationSkeleton);
  }, [request]);

  // The shared threshold, applied once here instead of once per link. Keeping it
  // out of `LinkPendingOverlay` also keeps a `setTimeout` off every anchor the
  // storefront paints (dozens on a home page).
  const show = useDelayedFlag(request !== null, NAVIGATION_SKELETON_DELAY_MS);

  if (!show || request === null) return null;
  return <NavigationSkeleton kind={request.kind} />;
}
