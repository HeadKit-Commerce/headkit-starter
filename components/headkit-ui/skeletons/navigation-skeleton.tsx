"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionPageSkeleton } from "@/components/headkit-ui/skeletons/collection-page-skeleton";
import {
  HEADER_REGION_SELECTOR,
  headerBottomCssValue,
} from "@/lib/header-bottom";
import type { NavigationSkeletonKind } from "@/lib/navigation-skeleton-target";

/**
 * Full-page skeleton for a CLIENT NAVIGATION that is still in flight, in one
 * shape per route family. Off by default platform-wide — see
 * `lib/nav-interaction-flags.ts`.
 *
 * WHY THIS IS NOT A `loading.tsx` OR AN IN-PAGE `<Suspense>`, and must never
 * become one. Both of those live in the RSC tree, so they apply to a DIRECT load
 * too — and under Cache Components a fallback that can render commits the
 * response as 200 before `notFound()` or `permanentRedirect()` can throw, which
 * turns every missing product into a soft 404 and every flat product URL into a
 * 200 instead of a 308. `AGENTS.md` owns that rule under "Setting a status code
 * needs THREE conditions", and eight route families are gated by it. This
 * component is reached only from a client gesture — a link press or a facet tick
 * — so a direct load never renders any of this markup, the 404 and 308 paths are
 * untouched, and the prerendered HTML is byte-for-byte what it was.
 *
 * THE DELAY IS THE WHOLE DESIGN, AND IT IS ONE NUMBER FOR EVERY ROUTE. What
 * makes a threshold safe is that the distribution is BIMODAL — a warm,
 * edge-cached navigation, or an on-demand render — with nothing in between, so
 * {@link NAVIGATION_SKELETON_DELAY_MS} sits in the empty middle. Measured on the
 * fork's rehearsal storefront, 48 warm samples across all four families:
 * collections 0.24-0.44 s, posts 0.21-0.60 s, CMS pages 0.20-1.11 s, PDPs
 * 0.22-0.39 s — one distribution, not four — against 8.2-10.0 s for a genuinely
 * cold, never-prerendered collection facet. A per-route constant would be four
 * copies of the same number.
 *
 * The residual risk is a navigation that lands just past the threshold (a
 * middling mobile connection), which would show the skeleton very briefly. That
 * is softened by the fade-in rather than by a minimum visible duration: holding a
 * skeleton over content that has ALREADY arrived is a worse trade than a short
 * fade, because it delays the real page to protect an animation.
 *
 * ACCESSIBILITY. The skeleton is decorative and `aria-hidden`, exactly as
 * `LinkPendingOverlay` is; a screen reader must not be read a wall of empty
 * boxes. The one thing it should hear is that something is loading, so a visually
 * hidden polite live region carries that sentence and nothing else.
 */

/**
 * How long a navigation must stay pending before its skeleton appears.
 *
 * Exported so a guard can pin it rather than re-deriving a magic number.
 */
export const NAVIGATION_SKELETON_DELAY_MS = 400;

/**
 * `active`, but only once it has been continuously true for `delayMs`.
 *
 * Falls back to false the instant `active` does, with the pending timer torn
 * down — a navigation that completes before the threshold must leave nothing
 * behind, including a timer that would fire onto the next one.
 *
 * Exported for `navigation-skeleton.test.tsx`, which is the only place the timing
 * claim can be made: it is a statement about state surviving (or not surviving)
 * across time, which no pure function can carry.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    // Cleanup, not a branch in the effect body: it is the ONE place the flag is
    // lowered, and it runs both when the navigation ends and when the component
    // unmounts, so a completed navigation can never leave a raised flag or a live
    // timer behind for the next one.
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
}

/**
 * The PDP body — a deliberate mirror of what `ProductDetail` renders above the
 * fold, so the swap to the real page does not jump.
 *
 * Read `components/headkit-ui/product-detail.tsx` and
 * `product-image-gallery.tsx` together before changing a class here. The shape
 * mirrored is the starter's own: a two-column `md:grid-cols-2` split, the default
 * `grid` gallery's full-width hero tile over two half tiles (all `aspect-square`),
 * and the buy box's order — brand, title, excerpt, selectors, availability,
 * PRICE, then the quantity + add-to-bag row. A store whose branding selects
 * another `pdpGalleryLayout` gets slightly different proportions here; that is a
 * moment of imprecise grey boxes, not a wrong page.
 *
 * Only the first viewport is drawn, in every body below. The host is
 * `position: fixed` and clips, so carousels and bands below the fold would be
 * markup nobody can see.
 */
export function ProductNavigationSkeletonBody(): React.JSX.Element {
  return (
    <div className="px-5 py-8 md:px-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Gallery — the default `grid` layout's masonry pair. */}
        <div>
          <div className="hidden gap-5 md:grid md:grid-cols-2">
            <Skeleton className="col-span-2 aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
          </div>
          <Skeleton className="aspect-square w-full md:hidden" />
        </div>

        {/* Buy box. */}
        <div className="flex flex-col">
          {/* ProductBrandLink. */}
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="mb-3 h-8 w-full" />
          <Skeleton className="mb-5 h-8 w-2/3" />

          {/* Excerpt. */}
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-5 h-4 w-5/6" />

          {/* Variation selectors. */}
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-10 w-10 shrink-0 rounded-full"
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-14" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-14 shrink-0" />
                ))}
              </div>
            </div>
          </div>

          {/* Availability, then price — the starter's order. */}
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mb-6 h-7 w-32" />

          {/* Quantity stepper + add to bag. */}
          <div className="mb-6 flex items-center gap-3">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 flex-1" />
          </div>

          {/* Accordion rows (description, details, shipping…). */}
          <div className="border-t pt-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-b py-4">
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The category body — `CollectionPageSkeleton`, unchanged and not re-drawn.
 *
 * That component already mirrors `CollectionHeader` + the subcategory strip + the
 * filter bar + the product grid, because seven server routes use it as their App
 * Shell fallback. Copying its proportions into a second file is exactly the drift
 * `AGENTS.md` warns about, so this asks for the same component and only turns the
 * pulse ON — a motionless grey page is what the skeleton exists to avoid looking
 * like, whereas in a CDN-sealed RSC shell the pulse is bytes on every request and
 * is correctly off.
 */
export function CollectionNavigationSkeletonBody(): React.JSX.Element {
  return <CollectionPageSkeleton animated />;
}

/**
 * The post-article body — `FeaturedImageHeader`'s hero card, then the prose
 * column `PostBody` renders under it.
 *
 * The hero is the reason a post cannot borrow the page body below: it is the
 * tallest first viewport on the site (`aspect-square` on mobile, `aspect-video`
 * capped at 70svh from `md`), and a title-and-prose skeleton under it would jump
 * by most of a screen when the real article arrives.
 */
export function PostNavigationSkeletonBody(): React.JSX.Element {
  return (
    <div className="headkit-news-article">
      <div className="mx-5">
        <Skeleton className="aspect-square w-full rounded-brand md:aspect-video md:max-h-[70svh]" />
      </div>
      {/* PostBody's own padding: my-[40px] px-[20px] md:px-[40px]. */}
      <div className="my-[40px] space-y-3 px-[20px] md:px-[40px]">
        {["w-full", "w-full", "w-5/6", "w-full", "w-2/3"].map(
          (width, index) => (
            <Skeleton key={index} className={`h-4 ${width}`} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The CMS-page body — the same proportions `app/[...slug]/page.tsx` already draws
 * in its own `<Suspense>` fallback (breadcrumb line, title, two prose lines),
 * extended to fill the first viewport.
 */
export function PageNavigationSkeletonBody(): React.JSX.Element {
  return (
    <div className="space-y-4 px-5 py-10 md:px-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="space-y-3 pt-2">
        {["max-w-xl", "max-w-lg", "max-w-xl", "max-w-md", "max-w-lg"].map(
          (width, index) => (
            <Skeleton key={index} className={`h-4 w-full ${width}`} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * One row per kind: the body to draw and the sentence to announce.
 *
 * The sentences are separate strings rather than one templated line because a
 * screen-reader user is told WHAT is coming, and "Loading page" over an article
 * or a category grid is less than the region is worth.
 */
const SKELETON_BODIES: Record<
  NavigationSkeletonKind,
  { Body: () => React.JSX.Element; announcement: string }
> = {
  product: {
    Body: ProductNavigationSkeletonBody,
    announcement: "Loading product page",
  },
  collection: {
    Body: CollectionNavigationSkeletonBody,
    announcement: "Loading category page",
  },
  post: { Body: PostNavigationSkeletonBody, announcement: "Loading article" },
  page: { Body: PageNavigationSkeletonBody, announcement: "Loading page" },
};

/**
 * The one thing a screen reader should hear while the skeleton is up.
 *
 * Mounted EMPTY and filled on the next commit, deliberately. A live region
 * inserted into the DOM with its text already in place is not reliably announced
 * — assistive technology watches an existing region for CHANGES — so the sentence
 * has to arrive as a change to a region that was already there.
 */
function LoadingAnnouncement({ text }: { text: string }): React.JSX.Element {
  const region = useRef<HTMLSpanElement>(null);

  // Written to the DOM rather than through state, which is what an effect is
  // for: the region must be EMPTY in the commit that inserts it and gain its text
  // in a later one, and that is a fact about the DOM, not about React state
  // anything renders from.
  useEffect(() => {
    const node = region.current;
    if (!node) return;
    node.textContent = text;
  }, [text]);

  return (
    <span ref={region} role="status" aria-live="polite" className="sr-only" />
  );
}

/**
 * The skeleton, mounted over the viewport for as long as the navigation runs.
 *
 * PORTALLED TO `document.body`, and that is load-bearing rather than tidy. A
 * transformed ancestor becomes the containing block for `position: fixed`, and
 * the storefront is full of them (every Embla carousel track is
 * `transform: translate3d(…)`), so an un-portalled overlay gets trapped inside
 * one of them instead of covering the page.
 *
 * IT STARTS AT THE HEADER'S BOTTOM EDGE AND NEVER COVERS THE HEADER. In the App
 * Router the header is a LAYOUT element: it is mounted once and survives every
 * client navigation, so it is the one part of the page that provably does not
 * need to reload. An overlay drawn over it makes it vanish and come back, which
 * reads to a shopper — and read to this project's client on 2026-09-25 — as the
 * header reloading on every link press ("nav bar should already be in place, but
 * that reloads too"). Nothing reloaded; the cover was simply too tall. So the
 * skeleton is confined to the main content region, which is the only region that
 * actually has new content coming.
 *
 * This reverses an earlier `top: 0` on the fork, and the two objections that
 * produced it are answered rather than ignored:
 *
 *  - "The old page shows through at the top and reads as nothing happened." What
 *    showed through there was arbitrary page content under a nav-height strip.
 *    What shows through now is the HEADER and only the header — a persistent
 *    element the shopper expects to stay put, with every skeleton body starting
 *    flush under it. There is no strip of stale page left.
 *  - "The offset was measured ONCE on mount, so scrolling slid the old page
 *    through it." That was the real defect, and it is gone by construction: the
 *    top is the live CSS custom property `NavigationBar` republishes on every
 *    scroll and resize frame (`lib/header-bottom.ts`), so the browser re-resolves
 *    it with no React work. The measurement is the nav's own
 *    `getBoundingClientRect().bottom`, which is why a preheader is included at the
 *    top of the page and excluded once it has scrolled away, and why the mobile
 *    sheet and this overlay cannot disagree about where the header ends.
 *
 * `z-50` IS KEPT, and the header is uncovered by GEOMETRY, not by z-order.
 * Dropping under the nav's `z-20` would also drop under two things that are page
 * content rather than chrome — the PDP sticky add-to-cart bar (`z-40`) and the
 * consent banner (`z-[45]`) — and the OLD page's copy of those would then float
 * over the skeleton. Since the overlay no longer overlaps the header at all, its
 * z-index says nothing about the header either way. `z-50` still clears a sticky
 * filter card's `z-30` and stays under the mobile sheet's `z-[60]`, which is
 * closing anyway on any navigation that raises this.
 *
 * `pointer-events-none` IS WHAT LETS THE PAGE SCROLL. A fixed, opaque,
 * `overflow: hidden` box under the cursor swallows the wheel, so the shopper
 * could not scroll while it was up. Nothing in here is interactive (the whole
 * thing is `aria-hidden`), so it has no need of the events. What it DOES still
 * need to absorb is a press: without the overlay in the way, one would land on
 * the old page underneath and start a second navigation to something the shopper
 * cannot see. So `mousedown` / `pointerdown` / `click` are swallowed in the
 * capture phase and wheel and touch are deliberately left alone — blocking
 * `touchstart` there would take touch scrolling away again.
 *
 * THE SWALLOW EXEMPTS THE HEADER, or the fix would be cosmetic only. That
 * listener is on `document`, so it deadens the whole page including the strip the
 * overlay has just stopped covering — a visible, unclickable header is a worse
 * lie than a hidden one. A press is let through when BOTH hold: it landed inside
 * the marked header region, and the pressed element sits entirely above the
 * overlay's top edge. The second half is what keeps an open mega-menu PANEL
 * swallowed: Radix renders the viewport inside the nav root, so it is inside the
 * header region by containment while hanging below the header's bottom edge —
 * under the overlay, invisible, and not something a press should reach.
 */
export function NavigationSkeleton({
  kind,
}: {
  kind: NavigationSkeletonKind;
}): React.JSX.Element | null {
  const overlay = useRef<HTMLDivElement>(null);

  // Swallow presses, but never wheel or touch, and never inside the header. See
  // the docblock: the overlay is `pointer-events-none` so scrolling works, which
  // also means a click would otherwise reach the old page underneath and start a
  // second navigation — while the header, which the overlay no longer covers,
  // has to stay live.
  useEffect(() => {
    const inUncoveredHeader = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      if (!target.closest(HEADER_REGION_SELECTOR)) return false;
      const top = overlay.current?.getBoundingClientRect().top;
      if (typeof top !== "number") return false;
      // Entirely above the overlay. The 1px slack absorbs subpixel rounding
      // between the nav's measured bottom and the overlay's resolved top, which
      // are the same edge.
      return target.getBoundingClientRect().bottom <= top + 1;
    };
    const swallow = (event: Event): void => {
      if (inUncoveredHeader(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const types = ["pointerdown", "mousedown", "click"] as const;
    for (const type of types) {
      document.addEventListener(type, swallow, { capture: true });
    }
    return () => {
      for (const type of types) {
        document.removeEventListener(type, swallow, { capture: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  const { Body, announcement } = SKELETON_BODIES[kind];

  return createPortal(
    <>
      <div
        ref={overlay}
        aria-hidden
        // `inset-0` still supplies right/bottom/left; the inline `top` overrides
        // its `top: 0` with the live header-bottom property. Inline rather than a
        // Tailwind arbitrary value so the custom property and its fallback have
        // exactly one definition, in `lib/header-bottom.ts`.
        style={{ top: headerBottomCssValue() }}
        className="animate-in fade-in pointer-events-none fixed inset-0 z-50 overflow-hidden bg-brand-bg duration-200"
        data-testid="navigation-skeleton"
        data-skeleton-kind={kind}
      >
        <Body />
      </div>
      <LoadingAnnouncement text={announcement} />
    </>,
    document.body,
  );
}
