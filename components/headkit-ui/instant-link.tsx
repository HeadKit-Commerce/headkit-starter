"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { convertToRelativePath, isAppNavigationHref } from "@/lib/convert-uri";
import {
  navigationSkeletonForHref,
  type NavigationSkeletonKind,
} from "@/lib/navigation-skeleton-target";
import { requestNavigationSkeleton } from "@/lib/navigation-skeleton-store";
import {
  navigationSkeletonEnabled,
  navMouseDownEnabled,
  navPrefetchBudgetEnabled,
} from "@/lib/nav-interaction-flags";
import { cn } from "@/lib/utils";

type PendingVariant = "card" | "text";

/**
 * Pending cue for Instant Navigation — must render as a child of `<Link>`.
 * Card: translucent pulse over media/cards. Text: subtle pulse behind label.
 *
 * It draws the PULSE only. The full-page skeleton (when a store has opted into
 * it) is requested by the link's own event handler and drawn by an always-mounted
 * host, and both halves of that had to move — see
 * `lib/navigation-skeleton-store.ts` for the measured reason. In short: inside a
 * container that dismisses on click, `pending` is never observed here at all.
 * Traced live in a mega-menu with a log on every run of this hook: across a 4.4 s
 * navigation it ran with `pending === false` and then unmounted — not one
 * `pending === true` render, so the pulse never painted either. Radix closes the
 * menu in the same click, and the unmount supersedes the render the pending state
 * would have committed.
 *
 * That is why the skeleton request is made from the handler, not from here: a
 * function call in an event handler always runs, and a render can be thrown away.
 *
 * The pulse still belongs to `pending`, and it is RIGHT that it is missing in a
 * menu that closed: it is a local cue meaning "this card took your click", and the
 * card is gone. The skeleton is the cue that has to survive, because the wait it
 * describes does.
 */
function LinkPendingOverlay({
  variant,
}: {
  variant: PendingVariant;
}): React.JSX.Element | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  // pointer-events-none: pending overlays must not steal hit-testing or Safari
  // will flip the cursor back to the default arrow over the link.
  if (variant === "text") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] animate-pulse rounded-sm bg-primary/10"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-brand-bg/40"
    />
  );
}

type InstantLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  pendingVariant?: PendingVariant;
  /**
   * Force the full-page skeleton this link's destination gets, overriding what
   * `navigationSkeletonForHref` derives from the href.
   *
   * The escape hatch for a route whose shape a URL cannot carry. Today that is
   * exactly one case: a post article lives under the store's WordPress Posts-page
   * slug, which is server data, so the two post cards pass `skeleton="post"` from
   * where they already resolve it. `null` suppresses the skeleton for a link that
   * would otherwise get one.
   */
  skeleton?: NavigationSkeletonKind | null | undefined;
  /**
   * Widened from `next/link`'s own `boolean | 'auto' | null`, which under this
   * repo's `exactOptionalPropertyTypes` rejects an explicit `undefined`. Callers
   * that decide per item (`ProductCarousel`'s `prefetchCount`, the nav's threaded
   * flag) need to say "unset" as a VALUE, so `undefined` is allowed here and is
   * resolved by `resolvePrefetch` below rather than forwarded blindly.
   */
  prefetch?: ComponentProps<typeof Link>["prefetch"] | undefined;
};

/**
 * What a link with no explicit `prefetch` asks `next/link` for.
 *
 * WITHOUT the prefetch budget (the platform default), `true` — every in-app link
 * full-prefetches, which is what the starter has always done and what its 50-odd
 * call sites were written against.
 *
 * WITH the budget on, unset — `next/link`'s own `'auto'` intent. Under
 * `cacheComponents` that maps to `FetchStrategy.PPR`
 * (`next/dist/client/app-dir/link.js`, `getFetchStrategyFromPrefetchIntent`): a
 * `/_tree` request plus the route's static per-segment bundles, and NO runtime
 * request. `prefetch={true}` maps to `FetchStrategy.Full`, which downloads the
 * whole per-URL payload so `'use cache'` content keyed on `params` resolves before
 * the click.
 *
 * Why the budget exists at all: `true` per link wins once it lands (78-90 ms vs
 * ~3,000 ms to navigate, measured on the Bike Society fork) and loses until it
 * does. That storefront's home page carries 63 product links at ~250-275 KB
 * decoded each, so the sweep never finished — measured live 2026-09-15, the last
 * prefetch completed at 33,084 ms having covered 31 of 213 links, and a
 * product-card click made during that window cost 4.0-5.8 s MORE than the same
 * click with every prefetch blocked. With the budget on, the head start is spent
 * explicitly instead: the top-level desktop nav (`navigation-bar.tsx`) and the
 * first visible row of the page's first product carousel
 * (`product-carousel.tsx`'s `prefetchCount`). Everything else pays the cold-fetch
 * cost, which is the accepted price of the trade.
 *
 * The budget also turns on `partialPrefetching` in `next.config.ts`, from the same
 * variable — that is what makes an unset `prefetch` cheap. See
 * `lib/nav-interaction-flags.ts`.
 *
 * Do NOT reach for `prefetch={false}` to quieten a link: that is `'none'`, and
 * `link.js`'s hover handler returns early on it, so it disables hover and touch
 * prefetch too. Unset keeps those.
 */
function resolvePrefetch(
  explicit: ComponentProps<typeof Link>["prefetch"] | undefined,
): ComponentProps<typeof Link>["prefetch"] | undefined {
  if (explicit !== undefined) return explicit;
  return navPrefetchBudgetEnabled() ? undefined : true;
}

/**
 * The path part of an in-app href, for the skeleton host's "already there" exit.
 *
 * Query and hash are dropped because the host compares against
 * `location.pathname`, which carries neither.
 */
function pathnameOfHref(href: string): string | null {
  if (!href.startsWith("/")) return null;
  const end = href.search(/[?#]/);
  return end === -1 ? href : href.slice(0, end);
}

function hrefToString(href: ComponentProps<typeof Link>["href"]): string {
  if (typeof href === "string") return href;
  if (href != null && typeof href === "object" && "pathname" in href) {
    return href.pathname ?? "";
  }
  return "";
}

function normalizeLinkHref(
  href: ComponentProps<typeof Link>["href"],
): ComponentProps<typeof Link>["href"] {
  if (typeof href === "string") {
    const normalized = convertToRelativePath(href);
    return normalized || href;
  }
  if (
    href != null &&
    typeof href === "object" &&
    "pathname" in href &&
    typeof href.pathname === "string"
  ) {
    const normalized = convertToRelativePath(href.pathname);
    if (normalized && normalized !== href.pathname) {
      return { ...href, pathname: normalized };
    }
  }
  return href;
}

/**
 * Why a mouse-down navigation must refuse most of the presses it sees.
 *
 * Only reached when a store opts into `NEXT_PUBLIC_NAV_MOUSEDOWN`; the predicate
 * itself is always exported, because it is the rule and it is tested as one.
 *
 * Adopted from NextFaster (`src/components/ui/link.tsx`): a click is 80-150 ms of
 * `mousedown` → `mouseup` → `click` that the navigation does not have to wait
 * for, and starting it at `mousedown` costs the origin nothing. Measured on the
 * fork against a 120 ms press, the target route's first request leaves at 28-33 ms
 * after the press instead of 175-180 ms.
 *
 * The whole risk is in what it must NOT hijack. A shopper comparing products
 * opens several in tabs, and every one of those gestures arrives as a `mousedown`
 * on a product link:
 *
 *   - middle-click (`button === 1`) — open in a new tab
 *   - ctrl-click (Windows/Linux) and cmd-click (macOS) — open in a new tab
 *   - shift-click — open in a new window
 *   - right-click (`button === 2`) — context menu, navigating nowhere
 *   - alt-click — the browser's download-the-target gesture
 *
 * Hijacking any of them replaces the shopper's gesture with a same-tab navigation
 * and loses the page they were on. So this returns a REASON for every refusal
 * rather than a bare boolean, and `null` only for the plain left-click with no
 * modifier on an anchor that targets this tab.
 *
 * It is a pure function of the fields it reads so the refusals are testable
 * without a DOM (`instant-link.test.tsx`, node environment); the DOM-level claim
 * it cannot make — that mouse-down navigating does not leave the following click
 * navigating a SECOND time — is covered separately, in jsdom
 * (`instant-link.mouse-down.test.tsx`).
 */
export type MouseDownNavigationRefusal =
  | "not-left-button"
  | "modifier-key"
  | "already-handled"
  | "opens-elsewhere"
  | "download";

export function mouseDownNavigationRefusal(event: {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** The anchor's own `target`; `""`/absent means this tab. */
  anchorTarget?: string | null | undefined;
  /** Whether the anchor carries a `download` attribute. */
  anchorDownload?: boolean | undefined;
}): MouseDownNavigationRefusal | null {
  // Something upstream (a Radix trigger, a caller's own handler) already claimed
  // this gesture.
  if (event.defaultPrevented) return "already-handled";
  // 0 = primary. 1 = middle (new tab), 2 = secondary (context menu).
  if (event.button !== 0) return "not-left-button";
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return "modifier-key";
  }
  if (event.anchorDownload) return "download";
  const target = event.anchorTarget ?? "";
  if (target !== "" && target !== "_self") return "opens-elsewhere";
  return null;
}

/**
 * Next.js 16.3 Instant Navigation link.
 *
 * Three behaviours here are per-store switches, each defaulting to what the
 * platform does today — the prefetch budget, mouse-down navigation and the
 * full-page navigation skeleton. `lib/nav-interaction-flags.ts` owns the value
 * table and the reason each one is opt-in; `resolvePrefetch` above owns the
 * prefetch half.
 *
 * Absolute http(s) storefront URLs from WooCommerce/Shopify CMS fields are
 * normalized to relative paths (same as nav menus) so carousel CTAs and block
 * buttons get Next.js prefetch instead of a full document load.
 *
 * Non-app hrefs (`tel:`, `mailto:`, `#`, off-origin http(s), …) render a plain
 * `<a>` so special-scheme Custom Links from WordPress menus keep working. That
 * branch gets none of the three behaviours above: off-origin, `tel:`, `mailto:`
 * and `#` hrefs keep pure browser default behaviour.
 *
 * WITH `NEXT_PUBLIC_NAV_MOUSEDOWN` ON, an in-app navigation is started by
 * dispatching a click on the anchor (`anchor.click()`) rather than by calling
 * `useRouter().push()`, for two reasons. It reuses `next/link`'s own click
 * handler, so `replace`, `scroll`, `onNavigate`, the `useLinkStatus` pending state
 * and any injected `onClick` (Radix's dismiss, the mobile sheet's close) all
 * behave exactly as they do on a real click. And it adds no router-context
 * dependency: this component is server-rendered bare by a dozen test files, and
 * `useRouter()` throws without an app-router context.
 *
 * The real `click` that follows is then swallowed, or the shopper navigates twice.
 * `event.detail > 0` is what separates it from a KEYBOARD activation — Enter on a
 * focused link fires a click with `detail === 0` and no preceding `mousedown`, so
 * it must always pass through even if a stale suppression flag is set (mouse-down
 * on a link, drag off, release: no click ever arrives to clear it).
 *
 * That plain `<a>` MUST still forward every prop it was handed. InstantLink is
 * used as a Radix `asChild` target (see NavigationBar), and Radix injects the
 * trigger wiring — `ref`, `onPointerEnter`/`onClick`, `id`, `aria-expanded`,
 * `data-state`, `data-radix-collection-item` — through the child's props. Dropping
 * them turned a WordPress mega-menu parent whose Custom Link URL is `#` (the
 * conventional "opens a dropdown, navigates nowhere" parent) into an inert anchor:
 * the trigger never mounted, so its children were unreachable and the item looked
 * like a plain top-level link. Only `next/link`-specific props are stripped — they
 * are not valid DOM attributes on `<a>`.
 */
export function InstantLink({
  prefetch,
  pendingVariant = "card",
  skeleton,
  className,
  children,
  href,
  ...rest
}: InstantLinkProps): React.JSX.Element {
  // Set while a mouse-down-initiated navigation is in flight, so the real `click`
  // that follows the same gesture is swallowed instead of navigating a second
  // time. A ref, not state: nothing renders from it.
  const suppressNextClickRef = useRef(false);
  // Guards one skeleton request per gesture. Never cleared on the way out: the
  // host ends the request, and this component may be gone by then.
  const skeletonTokenRef = useRef<number | null>(null);

  const normalizedHref = normalizeLinkHref(href);
  const hrefStr = hrefToString(normalizedHref);

  if (hrefStr && !isAppNavigationHref(hrefStr)) {
    // Destructured (not deleted by key) so a future next/link rename fails the
    // typecheck here instead of silently leaking a prop onto the DOM.
    const {
      as: _as,
      replace: _replace,
      scroll: _scroll,
      shallow: _shallow,
      passHref: _passHref,
      locale: _locale,
      legacyBehavior: _legacyBehavior,
      onNavigate: _onNavigate,
      ...anchorProps
    } = rest;
    const isHttpExternal =
      hrefStr.startsWith("http://") || hrefStr.startsWith("https://");
    return (
      <a
        {...anchorProps}
        href={hrefStr}
        className={cn("relative cursor-pointer", className)}
        {...(isHttpExternal
          ? {
              target: anchorProps.target ?? "_blank",
              rel: anchorProps.rel ?? "noopener noreferrer",
            }
          : {})}
      >
        {children as ReactNode}
      </a>
    );
  }

  const {
    onMouseDown: callerOnMouseDown,
    onClick: callerOnClick,
    ...linkRest
  } = rest;

  const resolvedPrefetch = resolvePrefetch(prefetch);
  const destinationSkeleton =
    skeleton === undefined ? navigationSkeletonForHref(hrefStr) : skeleton;

  /**
   * Open the skeleton request for this link, from the gesture that starts the
   * navigation.
   *
   * IN THE HANDLER, NOT IN A RENDER OR AN EFFECT, and that is the whole repair. A
   * handler call is synchronous and unconditional; a render can be superseded
   * before it commits, which is exactly what a dismiss-on-click container does —
   * a mega-menu's own close beat every `pending === true` render this link would
   * have produced, so nothing downstream of `useLinkStatus()` ever ran.
   *
   * Idempotent per navigation: with mouse-down navigation on, `handleMouseDown`
   * dispatches a click that re-enters `handleClick`, and a keyboard activation
   * arrives at `handleClick` with no mouse-down at all, so the token guard is what
   * keeps one gesture to one request.
   */
  const openSkeletonRequest = (): void => {
    // The per-store switch, checked first so an "off" store allocates no token and
    // writes nothing to the store — the host is not mounted to draw it, and a
    // request nobody draws would sit there until the 15 s ceiling.
    if (!navigationSkeletonEnabled()) return;
    if (destinationSkeleton === null) return;
    if (skeletonTokenRef.current !== null) return;
    skeletonTokenRef.current = requestNavigationSkeleton(
      destinationSkeleton,
      pathnameOfHref(hrefStr),
    );
  };

  const handleMouseDown = (
    event: React.MouseEvent<HTMLAnchorElement>,
  ): void => {
    callerOnMouseDown?.(event);
    if (!navMouseDownEnabled()) return;
    suppressNextClickRef.current = false;
    const anchor = event.currentTarget;
    if (
      mouseDownNavigationRefusal({
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        anchorTarget: anchor.getAttribute("target"),
        anchorDownload: anchor.hasAttribute("download"),
      }) !== null
    ) {
      return;
    }
    openSkeletonRequest();
    // Dispatched BEFORE the flag is raised, so this click is the one that
    // navigates and only the shopper's own click is swallowed.
    anchor.click();
    suppressNextClickRef.current = true;
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (suppressNextClickRef.current && event.detail > 0) {
      suppressNextClickRef.current = false;
      // stopPropagation as well as preventDefault: the dispatched click has
      // already bubbled to every ancestor handler once.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    suppressNextClickRef.current = false;
    // A click that did NOT come from this component's own mouse-down: an ordinary
    // click with the mouse-down switch off, a keyboard activation, or a gesture a
    // caller's handler is driving. It still navigates, so it still needs the
    // request.
    openSkeletonRequest();
    callerOnClick?.(event);
  };

  return (
    <Link
      {...linkRest}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      href={normalizedHref}
      // Omitted, not passed as `undefined`: `next/link`'s own prop type is
      // `boolean | 'auto' | null` and this repo runs `exactOptionalPropertyTypes`,
      // so an explicit `undefined` does not typecheck. An absent prop is what
      // 'auto' means.
      {...(resolvedPrefetch === undefined
        ? {}
        : { prefetch: resolvedPrefetch })}
      className={cn("relative cursor-pointer", className)}
    >
      <LinkPendingOverlay variant={pendingVariant} />
      {children}
    </Link>
  );
}
