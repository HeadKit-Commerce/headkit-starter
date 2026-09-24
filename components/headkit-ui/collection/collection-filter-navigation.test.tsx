// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

/**
 * A filter change that NAVIGATES gets the full-page skeleton; one served in place
 * does not, and Load More must never see it.
 *
 * `CollectionProvider` settles a filter change one of two ways. On a
 * `/collections/*` route an attribute or brand change is a real route navigation —
 * `router.push` to `/f/<slug>` — because the server renders that combination from
 * its own cache entry. Everything else (sort, price, in-stock, category chips, Load
 * More, Load Previous) is served in place by `listCollectionProducts` with the URL
 * corrected by `history.replaceState`.
 *
 * Only the first can be silent for seconds, and only the first is a navigation a
 * link's own pending state cannot see — a filter tick is not a link click, so
 * nothing in `InstantLink` fires. The second already shows a cue: `ProductGrid` keeps
 * the cards the shopper is reading and appends a skeleton row, and `Filter` dims
 * itself. Raising a full-page skeleton over THAT would be a regression, most of all
 * for Load More, which appends to a grid mid-read.
 *
 * So these tests are about which path a change takes and what the grid holds while
 * it does, not about the skeleton's markup (`skeletons/navigation-skeleton.test.tsx`
 * owns that) or its 400 ms threshold.
 *
 * BOTH WAITS ARE HELD OPEN ON PURPOSE, and a guard that does not hold them is green
 * under the bug. A mocked `push` returns instantly, so the transition around it
 * settles before the 400 ms threshold and every skeleton assertion passes for the
 * wrong reason; likewise a server action that resolves instantly never reaches the
 * threshold either. So the navigation is held by a promise the test resolves
 * (`resolveNavigation`) and the in-place fetch by one it resolves separately
 * (`pendingFetch`).
 *
 * A NOTE ON THE FIRST CHANGE. `CollectionProvider` used to seed
 * `prevAttributeSlugRef` with `undefined`, so the first filter change on a
 * `/collections/*` route took the navigation branch even when no attribute or brand
 * moved — a sort or in-stock toggle pushed once, then later ones were served in
 * place. PR #517 records the slug on the initial pass and that is gone, which is why
 * the in-place cases below need no priming: a sort change is served in place from the
 * first tick.
 *
 * WHAT IT STILL CANNOT SEE. No router runs here, so nothing about the real
 * navigation is observed — not its duration, not the server read behind
 * `initialProducts`. The cold-click timings and the frame of the skeleton actually
 * painting are browser measurements, recorded in the fork's PR #44.
 */

// React 19 needs this before `act` will flush updates synchronously.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("server-only", () => ({}));

const push = vi.fn();

/**
 * Set to hold the pushed navigation open, the way a real `router.push` is held open
 * by the destination's RSC payload.
 *
 * jsdom has no router, so a mocked `push` returns instantly and React settles the
 * transition it rides in before the 400 ms threshold can be reached — every skeleton
 * assertion would then pass for the wrong reason. The provider calls
 * `startTransition` with a concise body, so `push`'s return value IS the
 * transition's result: returning a promise here makes React keep `isPending` true
 * until it resolves, which is the only lever this environment offers.
 */
let resolveNavigation: (() => void) | null = null;

vi.mock("next/navigation", () => ({
  // Literal, not BASE_PATH: `vi.mock` factories are hoisted above the top-level
  // consts, so reading one here is a TDZ crash.
  usePathname: (): string => "/collections/clothing",
  useSearchParams: (): URLSearchParams => new URLSearchParams(),
  useRouter: (): {
    push: (url: string) => void | Promise<void>;
    replace: () => void;
  } => ({
    push: (url: string): void | Promise<void> => {
      push(url);
      if (!holdNavigation) return;
      return new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      });
    },
    replace: (): void => {},
  }),
}));

/** Opt-in per test: most of them only care which path a change took. */
let holdNavigation = false;

/**
 * The server action, under the test's control so an in-place change can be held in
 * flight across the skeleton threshold instead of resolving instantly.
 */
let pendingFetch: {
  resolve: (value: {
    products: ProductSummaryFieldsFragment[];
    total: number;
  }) => void;
} | null = null;

vi.mock("@/lib/collection-actions", () => ({
  listCollectionProducts: (): Promise<{
    products: ProductSummaryFieldsFragment[];
    total: number;
  }> =>
    new Promise((resolve) => {
      pendingFetch = { resolve };
    }),
}));

// The filter sidebar needs popovers and icons this test has no opinion about; the
// filter values are driven through the context directly instead.
vi.mock("@/components/headkit-ui/collection/filter", () => ({
  Filter: (): null => null,
}));

// A card is one product name; the grid's own composition is covered elsewhere.
vi.mock("@/components/headkit-ui/product-card", () => ({
  ProductCard: ({
    product,
  }: {
    product: { name: string };
  }): React.JSX.Element => <span data-testid="card">{product.name}</span>,
}));

import { CollectionPage } from "@/components/headkit-ui/collection/collection-page";
import { useCollection } from "@/components/headkit-ui/collection/collection-context";
import { CatalogDisplayProvider } from "@/components/headkit-ui/catalog-display-provider";
import { NAVIGATION_SKELETON_DELAY_MS } from "@/components/headkit-ui/skeletons/navigation-skeleton";
import { NavigationSkeletonHost } from "@/components/headkit-ui/skeletons/navigation-skeleton-host";
import { resetNavigationSkeletonStore } from "@/lib/navigation-skeleton-store";

const PREFS = {
  showVariants: false,
  showSwatches: false,
  imageRollover: false,
  defaultCollectionSort: "CREATED_AT",
};

function product(name: string): ProductSummaryFieldsFragment {
  return {
    id: name,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    uri: `https://commerce.example.com/product/${name}/`,
    sku: `SKU-${name}`,
    type: "simple",
    price: "100",
    regularPrice: "100",
    salePrice: "",
    onSale: false,
    isNew: false,
    stockStatus: "instock",
    shortDescription: "",
    description: "",
    seo: null,
    image: { src: "https://cdn.example/x.jpg", alt: "", width: 1, height: 1 },
    galleryImages: [],
    attributes: [],
    variations: [],
    productCategories: [],
    brands: [],
  } as unknown as ProductSummaryFieldsFragment;
}

const PAGE_ONE = [product("Alpine Jacket"), product("Harbour Pump")];

const BASE_PATH = "/collections/clothing";

/** A handle on the live context, so a filter change can be driven exactly as the
 *  real checkbox, sort menu and Load More button drive it — through the provider's
 *  own API rather than by reaching into its state. */
type Handle = ReturnType<typeof useCollection>;
let handle: Handle | null = null;

function tree(props: {
  initialProducts: ProductSummaryFieldsFragment[];
  initialTotal: number;
  initialFilterValues?: Record<string, string[]>;
}): React.JSX.Element {
  return (
    <CatalogDisplayProvider prefs={PREFS}>
      {/* Mounted beside the listing, as the root layout mounts it: the provider
          only REQUESTS the skeleton, and the host is what draws it. */}
      <NavigationSkeletonHost />
      <CollectionPage
        initialProducts={props.initialProducts}
        initialTotal={props.initialTotal}
        productFilter={{ attributes: [], brands: [] } as never}
        categorySlug="clothing"
        categoryBasePath={BASE_PATH}
        {...(props.initialFilterValues
          ? { initialFilterValues: props.initialFilterValues }
          : {})}
      />
    </CatalogDisplayProvider>
  );
}

// The probe has to sit UNDER the provider, and `CollectionPage` renders a fixed
// child tree, so the pagination slot is borrowed: `ProductCount` is a context
// consumer already, and swapping it for one that also publishes the context is the
// least invasive way in. `LoadMore` is stubbed out with it — the button's own wiring
// is `pagination.tsx`'s, and what matters here is what `loadMore()` does to the grid.
vi.mock("@/components/headkit-ui/collection/pagination", () => ({
  LoadPrevious: (): null => null,
  LoadMore: (): null => null,
  ProductCount: (): React.JSX.Element => {
    const ctx = useCollection();
    handle = ctx;
    return (
      <p data-testid="count">{`total:${ctx.totalProducts} page:${ctx.currentPage}`}</p>
    );
  },
}));

function names(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-testid="card"]')].map(
    (el) => el.textContent ?? "",
  );
}

function skeletons(): number {
  return document.querySelectorAll('[data-testid="navigation-skeleton"]')
    .length;
}

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  // DECLARE the state this file exercises — the skeleton switched ON.
  // `lib/nav-interaction-flags.test.ts` owns the OFF state and the value table.
  vi.stubEnv("NEXT_PUBLIC_NAVIGATION_SKELETON", "true");
  resetNavigationSkeletonStore();
  // The host ends a request when the path it started from is no longer the current
  // one, so jsdom's own URL has to agree with the mocked `usePathname()` — otherwise
  // every request is cleared on its first effect and the skeleton assertions below
  // pass for the wrong reason.
  window.history.replaceState(null, "", BASE_PATH);
  holdNavigation = false;
  resolveNavigation = null;
  pendingFetch = null;
  handle = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function mount(initialFilterValues?: Record<string, string[]>): void {
  act(() => {
    root.render(
      tree({
        initialProducts: PAGE_ONE,
        initialTotal: 2,
        ...(initialFilterValues ? { initialFilterValues } : {}),
      }),
    );
  });
}

/** Let every queued effect, transition and microtask settle. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(NAVIGATION_SKELETON_DELAY_MS * 2);
  });
}

describe("a filter change that navigates", () => {
  it("pushes the filter path instead of fetching in place", async () => {
    mount();
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      handle?.setFilterValues({
        ...handle.filterValues,
        attributes: { pa_colour: ["black"] },
        page: 1,
      });
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toBe(`${BASE_PATH}/f/colour.black`);
    // The navigation renders the filtered set on the server; fetching it here too
    // would be the same products over the wire twice.
    expect(pendingFetch).toBeNull();
  });

  it("raises nothing at all when NEXT_PUBLIC_NAVIGATION_SKELETON is off, which is the default", async () => {
    // The OFF half of the per-store switch, on the raiser that is NOT a link —
    // `lib/nav-interaction-flags.test.ts` covers the link and owns the value table.
    // The positive test below is this one's control: same harness, same held
    // navigation, same clock, one variable different.
    vi.stubEnv("NEXT_PUBLIC_NAVIGATION_SKELETON", undefined);
    holdNavigation = true;
    mount();

    await act(async () => {
      handle?.setFilterValues({
        ...handle.filterValues,
        attributes: { pa_colour: ["black"] },
        page: 1,
      });
    });

    // Well past the threshold, with the navigation still held open.
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_SKELETON_DELAY_MS * 3);
    });
    expect(skeletons()).toBe(0);
    // And the filter change itself is untouched — the switch turns off the cover,
    // never the navigation under it.
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toBe(`${BASE_PATH}/f/colour.black`);

    await act(async () => {
      resolveNavigation?.();
    });
  });

  it("raises the shared category skeleton once the wait passes the threshold", async () => {
    holdNavigation = true;
    mount();

    await act(async () => {
      handle?.setFilterValues({
        ...handle.filterValues,
        attributes: { pa_colour: ["black"] },
        page: 1,
      });
    });

    // Under the threshold the shopper gets nothing, which is the point of the delay:
    // a warm filter navigation lands inside it and must stay silent.
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_SKELETON_DELAY_MS - 50);
    });
    expect(skeletons()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(skeletons()).toBe(1);
    // The category body, shared with the link-click path — not a second one.
    expect(
      document
        .querySelector('[data-testid="navigation-skeleton"]')
        ?.getAttribute("data-skeleton-kind"),
    ).toBe("collection");

    // And it comes down when the DESTINATION LANDS — not when the transition
    // settles. The provider does not withdraw its own request: a requester cannot
    // tell "the navigation finished" from "my container closed", which is the whole
    // reason the host owns the lifetime.
    await act(async () => {
      resolveNavigation?.();
    });
    expect(
      skeletons(),
      "The transition settled but the shopper is still looking at the old grid.",
    ).toBe(1);

    // The host polls `location`, so landing is a history change — not a React
    // re-render and not a mocked hook.
    window.history.replaceState(null, "", `${BASE_PATH}/f/colour.black`);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(skeletons()).toBe(0);
  });
});

describe("a listing update served in place", () => {
  it("raises no full-page skeleton for Load More, however long it takes", async () => {
    mount();
    // A second page exists, so Load More is live.
    await act(async () => {
      handle?.setFilterValues({ ...handle.filterValues, sort: "PRICE" });
    });
    expect(
      push,
      "sort is a query parameter, not part of the filter slug: it must be served in place",
    ).not.toHaveBeenCalled();
    expect(pendingFetch).not.toBeNull();
    act(() => {
      pendingFetch?.resolve({ products: PAGE_ONE, total: 4 });
    });
    await act(async () => {});
    pendingFetch = null;

    await act(async () => {
      handle?.loadMore();
    });
    // Held in flight well past the threshold: nothing may appear over the grid.
    settle();
    expect(pendingFetch).not.toBeNull();
    expect(skeletons()).toBe(0);
    expect(push).not.toHaveBeenCalled();
    // And the cards the shopper is reading are still there, which is the whole
    // reason a full-page skeleton would be wrong here.
    expect(names(host)).toEqual(["Alpine Jacket", "Harbour Pump"]);

    await act(async () => {
      pendingFetch?.resolve({ products: [product("Cadex Wheel")], total: 3 });
    });

    expect(names(host)).toEqual([
      "Alpine Jacket",
      "Harbour Pump",
      "Cadex Wheel",
    ]);
    expect(skeletons()).toBe(0);
  });

  it("raises no full-page skeleton for a slow sort change", async () => {
    mount();

    await act(async () => {
      handle?.setFilterValues({
        ...handle.filterValues,
        sort: "PRICE",
        page: 1,
      });
    });

    // Sort is a query parameter, not part of the filter slug, so it is served in
    // place — no navigation, and the in-grid cue owns the wait.
    expect(push).not.toHaveBeenCalled();

    settle();
    expect(pendingFetch).not.toBeNull();
    expect(skeletons()).toBe(0);
    expect(names(host)).toEqual(["Alpine Jacket", "Harbour Pump"]);

    await act(async () => {
      pendingFetch?.resolve({ products: [product("Cadex Wheel")], total: 1 });
    });

    expect(names(host)).toEqual(["Cadex Wheel"]);
    expect(skeletons()).toBe(0);
  });

  it("raises no full-page skeleton for a slow in-stock toggle", async () => {
    mount();

    await act(async () => {
      handle?.setFilterValues({
        ...handle.filterValues,
        instock: true,
        page: 1,
      });
    });

    expect(push).not.toHaveBeenCalled();
    settle();
    expect(skeletons()).toBe(0);
  });
});
