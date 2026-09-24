// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { PostCard } from "@/components/headkit-ui/post/post-card";
import { NAVIGATION_SKELETON_DELAY_MS } from "@/components/headkit-ui/skeletons/navigation-skeleton";
import {
  NavigationSkeletonHost,
  NAVIGATION_SKELETON_MAX_MS,
} from "@/components/headkit-ui/skeletons/navigation-skeleton-host";
import { resetNavigationSkeletonStore } from "@/lib/navigation-skeleton-store";

/**
 * The claim this file exists to make: with `NEXT_PUBLIC_NAVIGATION_SKELETON` on, a
 * pending navigation raises the skeleton its DESTINATION wants — the right body for
 * the route family, nothing at all for the routes that get none — and only after
 * the delay.
 *
 * It drives the whole chain (`InstantLink` → `navigationSkeletonForHref` → the
 * request store → `NavigationSkeletonHost` → the portal), because a test of any one
 * link passes while the others are broken: the predicate can be right while the
 * request is never opened, and the timer can be right while the skeleton is raised
 * for every link on the site. The post case drives the real `PostCard` for the same
 * reason — `"post"` is the one kind no URL carries, so a guard that hand-passed
 * `skeleton="post"` to `InstantLink` would stay green while the card stopped
 * sending it.
 *
 * The host is mounted BESIDE the link rather than around it, which is how the root
 * layout mounts it — and what makes the unmount case below testable at all.
 *
 * The presses here are ordinary CLICKS, the platform's default interaction
 * (`NEXT_PUBLIC_NAV_MOUSEDOWN` is off unless a store opts in). One case presses
 * with `mousedown` under that switch, to pin that the earlier gesture opens the
 * same request.
 *
 * WHERE IT STOPS.
 *  - `next/link` is mocked, so `pending` here is a value this file sets. That a real
 *    navigation reports `pending` for as long as it runs is Next's.
 *  - jsdom has no layout, so nothing here can see that the skeleton MATCHES the
 *    PDP, that it covers the sticky nav, or that `position: fixed` escapes a
 *    transformed carousel ancestor. Those are browser claims, measured on the fork
 *    this is ported from.
 *  - It says nothing about the direct-load path. That one is load-bearing and is
 *    proved where it is observable: over HTTP, with JavaScript off.
 *
 * jsdom is opted into per file; the global vitest environment stays `node`.
 */

const { linkStatus } = vi.hoisted(() => ({
  linkStatus: { pending: false },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        // jsdom cannot navigate, and a real <a> click would log through the
        // virtual console on every test.
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
  useLinkStatus: () => linkStatus,
}));

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement | null): void {
  act(() => {
    root.render(
      <>
        <NavigationSkeletonHost />
        {node}
      </>,
    );
  });
}

function skeleton(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '[data-testid="navigation-skeleton"]',
  );
}

function skeletonKind(): string | null {
  return skeleton()?.getAttribute("data-skeleton-kind") ?? null;
}

/**
 * The navigation lands: the router's path becomes the destination.
 *
 * This is the only way a request ends short of the ceiling, so it is the only way a
 * test can take the skeleton down.
 */
function land(href: string): void {
  window.history.replaceState(null, "", href);
  // One frame for the host's watcher to notice; it polls `location`.
  advance(50);
}

/**
 * Put an undrawn, in-viewport image inside `<main>`, the way a just-committed
 * product grid does.
 *
 * Here so the cases below can prove the host IGNORES it: a request must end at the
 * route change whether or not the destination's pictures have arrived, and must not
 * be held open by one when the route landed inside the delay.
 *
 * jsdom loads nothing and lays nothing out, so both halves are faked — `complete` is
 * false and the rect is stubbed to something on screen.
 */
function undrawnImageInViewport(): HTMLImageElement {
  const main = document.querySelector("main") ?? document.createElement("main");
  if (!main.isConnected) document.body.appendChild(main);
  const img = document.createElement("img");
  Object.defineProperty(img, "complete", { value: false, configurable: true });
  img.getBoundingClientRect = () =>
    ({ width: 300, height: 300, top: 10, bottom: 310 }) as DOMRect;
  main.appendChild(img);
  return img;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * The gesture, not a flag.
 *
 * The skeleton is requested by `InstantLink`'s own event handler, because a render
 * driven by `useLinkStatus()` is superseded before it commits inside a
 * dismiss-on-click container (see `instant-link.tsx`). So every case here has to
 * press the link; setting `linkStatus.pending` alone would prove nothing about the
 * path the storefront actually takes.
 */
function press(type: "click" | "mousedown" = "click", selector = "a"): void {
  const anchor = container.querySelector<HTMLAnchorElement>(selector);
  if (!anchor) throw new Error(`no anchor matching ${selector} to press`);
  act(() => {
    anchor.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
      }),
    );
  });
}

beforeEach(() => {
  // React 19 wants this flag before `act` will flush without warning.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  linkStatus.pending = false;
  // The host reads `location.pathname` directly — it may not use `usePathname()`,
  // which Next treats as URL data and which fails the production build from the
  // root layout. So a test navigates the way the browser does.
  window.history.replaceState(null, "", "/");
  // DECLARE the state this file exercises. The whole file is about what the skeleton
  // does when a store has switched it ON; inheriting the process's value would make
  // every assertion here depend on how the suite was launched.
  // `lib/nav-interaction-flags.test.ts` owns the OFF state.
  vi.stubEnv("NEXT_PUBLIC_NAVIGATION_SKELETON", "true");
  vi.stubEnv("NEXT_PUBLIC_NAV_MOUSEDOWN", undefined);
  resetNavigationSkeletonStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  // `undrawnImageInViewport` appends a <main> to the body, and the host looks the
  // DOM up globally rather than through the render tree — so leaving one behind
  // couples the next test to this one.
  document.querySelectorAll("main").forEach((el) => el.remove());
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const PRODUCT_HREF = "/shop/clothing/jackets/alpine-jacket";

describe("navigation skeleton on a pending navigation", () => {
  it("stays hidden for the whole delay, then appears", () => {
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();

    advance(NAVIGATION_SKELETON_DELAY_MS - 1);
    expect(
      skeleton(),
      "A warm PDP arrives in 0.22-0.39 s. Showing the skeleton inside that window is the flash the delay exists to prevent.",
    ).toBeNull();

    advance(1);
    expect(skeleton()).not.toBeNull();
  });

  it("opens the same request from a mousedown when that switch is on", () => {
    vi.stubEnv("NEXT_PUBLIC_NAV_MOUSEDOWN", "true");
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press("mousedown");

    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(
      skeletonKind(),
      "The two switches are independent: the skeleton must be raised by whichever gesture starts the navigation.",
    ).toBe("product");
  });

  it("never appears at all when the navigation lands before the delay", () => {
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();

    advance(200);
    linkStatus.pending = false;
    land(PRODUCT_HREF);

    // Past the threshold in absolute time: the timer from the first navigation must
    // have been torn down, not merely ignored.
    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(skeleton()).toBeNull();
  });

  it("survives the link being unmounted by a dismissible container", () => {
    // THE DEFECT THIS SHAPE EXISTS TO CLOSE. Radix's NavigationMenu closes on click
    // and unmounts its dropdown, so a mega-menu category link leaves the DOM while
    // its navigation is still running — measured at 157-161 ms against a 400 ms
    // threshold. While the skeleton rendered inside the link, that meant a 1.7 s
    // navigation showed nothing whatsoever.
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();

    // The container dismisses BEFORE the threshold, exactly as it does live.
    advance(160);
    render(null);
    expect(
      skeleton(),
      "Still inside the delay — nothing should be up yet, unmounted or not.",
    ).toBeNull();

    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(
      skeleton(),
      "The link is long gone and the navigation is still running; the skeleton is the only thing telling the shopper so.",
    ).not.toBeNull();
    expect(skeletonKind()).toBe("product");
  });

  it("gives up on a request nothing ever reported back on", () => {
    // The other half of surviving the unmount: with no component left to say the
    // navigation ended, and a destination whose path never differs from where it
    // started, the host's ceiling is the only exit. A skeleton stuck over the page
    // forever would be worse than the bug above.
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();
    advance(NAVIGATION_SKELETON_DELAY_MS);
    render(null);
    expect(skeleton()).not.toBeNull();

    advance(NAVIGATION_SKELETON_MAX_MS);
    expect(skeleton()).toBeNull();
  });

  it("is torn down as soon as the destination route commits", () => {
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();
    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(skeleton()).not.toBeNull();

    linkStatus.pending = false;
    land(PRODUCT_HREF);
    expect(
      skeleton(),
      "The real page has arrived. Holding the skeleton over it to protect the animation would delay the content the shopper asked for.",
    ).toBeNull();
  });

  it("never appears when the navigation lands before the delay, however slow the pictures are", () => {
    // A production build's catch on the fork, kept as a regression guard. A
    // prerendered destination landed in 53 ms and the skeleton still appeared at
    // 423 ms, because the request was being held open waiting for that page's
    // images to draw. Nothing was covering the page, so there was no blank frame to
    // avoid — the hold was manufacturing the flash it exists to prevent. With no
    // paint wait there is no hold left to do it, and an undrawn in-viewport image is
    // here so that reintroducing one fails. A dev server cannot show this: every
    // route there is cold, so nothing lands inside the delay.
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();

    advance(50);
    undrawnImageInViewport();
    land(PRODUCT_HREF);

    advance(NAVIGATION_SKELETON_DELAY_MS + 100);
    expect(
      skeleton(),
      "The page arrived before the threshold; nothing may raise a skeleton over it afterwards.",
    ).toBeNull();
  });

  it("comes down at the route change even with the pictures still undrawn", () => {
    // The route commits with its markup in place and its images undrawn (measured:
    // anchors at 5,454 ms, first image at 7,404 ms), and the skeleton is not held
    // over that gap — the shopper gets text and layout at once, with the pictures
    // arriving after.
    //
    // This is NOT uncovering an empty page: the image left undrawn here sits inside
    // a `<main>` that has already committed. jsdom cannot see a rendered frame, so
    // the no-blank half of that claim is a browser measurement, not this test's.
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();
    advance(NAVIGATION_SKELETON_DELAY_MS);

    const img = undrawnImageInViewport();
    expect(skeleton()).not.toBeNull();

    land(PRODUCT_HREF);
    expect(
      skeleton(),
      "The destination has committed. Waiting for its images again is a ~1.9 s hold over a page the shopper could be reading.",
    ).toBeNull();
    expect(
      img.complete,
      "The picture is still arriving, which is the whole point of the case.",
    ).toBe(false);
  });

  it.each([
    ["a category", "/collections/clothing", "collection"],
    ["a facet listing", "/collections/jackets/f/colour.black", "collection"],
    ["a brand PLP", "/brand/acme", "collection"],
    ["a CMS page", "/wholesale", "page"],
    ["the catalogue index", "/shop", "collection"],
  ])("raises the %s body for its own route family", (_l, href, kind) => {
    linkStatus.pending = true;
    render(<InstantLink href={href}>Elsewhere</InstantLink>);
    press();

    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(skeletonKind()).toBe(kind);
  });

  it("raises the post body from PostCard, which threads the kind itself", () => {
    linkStatus.pending = true;
    render(
      <PostCard
        post={{
          id: "1",
          slug: "autumn-sale",
          uri: "/journal/autumn-sale",
          title: "Autumn sale",
          excerpt: "",
          date: "2026-04-01T00:00:00",
        }}
        postsBasePath="journal"
      />,
    );
    press();

    advance(NAVIGATION_SKELETON_DELAY_MS);
    expect(
      skeletonKind(),
      'The blog base is per-store server data, so this kind can only arrive as a prop. A hand-passed skeleton="post" here would prove nothing about the card.',
    ).toBe("post");
  });

  it.each([
    ["the quote cart", "/quote"],
    ["checkout", "/checkout"],
    ["an account page", "/account"],
    ["the home page", "/"],
    ["a tel: link", "tel:1300883919"],
  ])("does not raise it for %s, which keeps today's behaviour", (_l, href) => {
    linkStatus.pending = true;
    render(<InstantLink href={href}>Elsewhere</InstantLink>);
    press();

    advance(NAVIGATION_SKELETON_DELAY_MS * 3);
    expect(skeleton()).toBeNull();
  });

  it("lets an explicit skeleton={null} suppress one the href would get", () => {
    linkStatus.pending = true;
    render(
      <InstantLink href="/collections/jackets" skeleton={null}>
        Jackets
      </InstantLink>,
    );
    press();

    advance(NAVIGATION_SKELETON_DELAY_MS * 3);
    expect(skeleton()).toBeNull();
  });

  it("keeps the local pulse overlay on every pending link, skeleton or not", () => {
    linkStatus.pending = true;
    render(<InstantLink href="/collections/jackets">Jackets</InstantLink>);
    press();

    expect(
      container.querySelector("span.animate-pulse"),
      "The immediate per-link cue is unchanged by this feature; the skeleton is an addition on top of it, not a replacement.",
    ).not.toBeNull();
  });

  it("hides the skeleton from assistive technology and announces instead", () => {
    linkStatus.pending = true;
    render(<InstantLink href={PRODUCT_HREF}>Product</InstantLink>);
    press();
    advance(NAVIGATION_SKELETON_DELAY_MS);

    expect(skeleton()?.getAttribute("aria-hidden")).toBe("true");

    const status = document.body.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    // Mounted empty, filled on a later commit: assistive technology watches an
    // EXISTING region for changes, so the sentence has to arrive as a change.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(status?.textContent).toBe("Loading product page");
  });
});
