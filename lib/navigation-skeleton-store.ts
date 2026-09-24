/**
 * The pending-navigation skeleton request, held OUTSIDE React's tree.
 *
 * WHY THIS MODULE EXISTS. The obvious place to render the skeleton is inside the
 * `<Link>` the shopper clicked, because `useLinkStatus()` only reports there.
 * That works for a link in the page — and fails for every link inside a container
 * that DISMISSES ON CLICK. Radix's NavigationMenu closes and unmounts its
 * dropdown, taking the link, the subscription and the skeleton with it. Measured
 * on the fork's mega-menu (2026-09-18): the category link left the DOM 157-161 ms
 * after the press, so a 1.7 s navigation showed nothing at all, while a footer
 * link on the same page — nothing dismisses it — raised the skeleton at 420 ms of
 * a 3.3 s wait. Same threshold, same component, opposite outcomes; the difference
 * was purely who owned the subscription.
 *
 * So the REQUEST is a module-level value and the skeleton is rendered by one
 * always-mounted host (`components/headkit-ui/skeletons/navigation-skeleton-host.tsx`).
 * A plain function call survives the caller unmounting; a React subtree does not.
 *
 * REQUESTERS ONLY ASK; THE HOST OWNS THE WHOLE LIFETIME. There is no release
 * call, deliberately: a cleanup cannot tell "the navigation finished" from "my
 * container closed", so a dismissed mega-menu would withdraw the skeleton it had
 * just asked for. The host ends every request, at route commit — see
 * `navigation-skeleton-host.tsx`. The happy consequence is that the trap
 * disappears rather than being avoided: there is no cleanup that could fire on a
 * container closing, because there is no cleanup.
 *
 * Deliberately NOT a React context: a context value is read through the tree, and
 * the whole problem is a caller that is no longer in it.
 */
import type { NavigationSkeletonKind } from "@/lib/navigation-skeleton-target";

export interface NavigationSkeletonRequest {
  kind: NavigationSkeletonKind;
  /**
   * Identifies THIS request. A shopper who clicks a second link while the first
   * is still pending gets the second link's skeleton, and the host re-keys its
   * teardown on the new request rather than finishing the old one's wait.
   */
  token: number;
  /**
   * `location.pathname` when the request was made — the host's primary exit.
   * Captured here rather than in the host because the host may not have
   * re-rendered since, and because the requesting call site is the one moment
   * the "before" path is unambiguous.
   */
  fromPathname: string;
  /**
   * The path being navigated TO, when the caller knows it.
   *
   * Carried so the host can end a request that can never be ended by a route
   * change — a link to the page the shopper is already on. Without it, such a
   * click inside a dismissible container (nothing left to report back, no path
   * change to observe) would hold the skeleton up until the ceiling.
   */
  toPathname: string | null;
}

let current: NavigationSkeletonRequest | null = null;
let nextToken = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Ask for a skeleton, and get back the token identifying the request.
 *
 * Client only — it reads `location.pathname`.
 */
export function requestNavigationSkeleton(
  kind: NavigationSkeletonKind,
  toPathname?: string | null,
): number {
  const token = nextToken++;
  current = {
    kind,
    token,
    fromPathname: window.location.pathname,
    toPathname: toPathname ?? null,
  };
  emit();
  return token;
}

/** Withdraw whatever is live. The host's exits, and nothing else, use this. */
export function clearNavigationSkeleton(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeNavigationSkeleton(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The snapshot for `useSyncExternalStore`. Referentially stable between changes,
 * which that hook requires — a fresh object per call would re-render forever.
 */
export function getNavigationSkeletonRequest(): NavigationSkeletonRequest | null {
  return current;
}

/** The server never has a pending client navigation. */
export function getServerNavigationSkeletonRequest(): null {
  return null;
}

/** Test seam: no suite may inherit another's live request. */
export function resetNavigationSkeletonStore(): void {
  current = null;
  nextToken = 1;
  listeners.clear();
}
