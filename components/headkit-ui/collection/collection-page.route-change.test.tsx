// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";

/**
 * The grid must show the products of the route it is currently on.
 *
 * `CollectionProvider` holds the product list, the total and the pagination
 * cursor in `useState`, seeded once per component INSTANCE. A same-route
 * navigation — `/search?q=helmet` → `/search?q=gloves` is the only listing shape
 * with no dynamic segment to remount it — re-renders that instance with new
 * props and React keeps the old state, so the shopper reads a heading for one
 * query above a grid of another query's products.
 *
 * These tests render the real `CollectionPage` → `CollectionProvider` →
 * `ProductGrid` chain into a DOM and re-render it AT THE SAME TREE POSITION,
 * which is what a client navigation does. The assertions are about the product
 * names, the total and the page number that come out the other side; nothing
 * here looks at how the provider stores them.
 *
 * What this does NOT cover: the live navigation itself (no router runs here, so
 * that Next re-renders rather than remounts `/search` is asserted nowhere in
 * this repo), the `/collections`, `/shop` and `/brand` routes' own
 * segment-keyed remount, and anything about the server read behind
 * `initialProducts`.
 *
 * It is this workspace's only `jsdom` test — the vitest environment stays
 * `node` and this file opts in with the docblock above. Reach for jsdom only
 * when the claim is literally about state surviving (or not surviving) a
 * re-render; every other client behaviour here is tested by extracting a pure
 * step.
 */

// React 19 needs this before `act` will flush updates synchronously.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: (): string => "/search",
  useSearchParams: (): URLSearchParams => new URLSearchParams(),
  useRouter: (): { push: () => void; replace: () => void } => ({
    push: (): void => {},
    replace: (): void => {},
  }),
}));

// Nothing here paginates; the server action would only fire on Load More.
vi.mock("@/lib/collection-actions", () => ({
  listCollectionProducts: async (): Promise<{
    products: unknown[];
    total: number;
  }> => ({ products: [], total: 0 }),
}));

// The filter sidebar needs popovers and icons this test has no opinion about.
vi.mock("@/components/headkit-ui/collection/filter", () => ({
  Filter: (): null => null,
}));

// Stand-ins that read the SAME context the real pagination does, so the total
// and the cursor are asserted through rendered output rather than by reaching
// into the provider.
vi.mock("@/components/headkit-ui/collection/pagination", () => ({
  LoadPrevious: (): null => null,
  LoadMore: (): null => null,
  ProductCount: (): React.JSX.Element => {
    const { totalProducts, currentPage } = useCollection();
    return (
      <p data-testid="count">{`total:${totalProducts} page:${currentPage}`}</p>
    );
  },
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
import type { CatalogDisplayPrefs } from "@/lib/catalog-display";

const PREFS: CatalogDisplayPrefs = {
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

const HELMETS = [product("Evade Helmet"), product("Hale Helmet")];
const GLOVES = [product("Deep Scrubber Gloves")];

interface Route {
  search: string;
  products: ProductSummaryFieldsFragment[];
  total: number;
  page?: number;
}

const HELMET_ROUTE: Route = { search: "helmet", products: HELMETS, total: 84 };
const GLOVES_ROUTE: Route = { search: "gloves", products: GLOVES, total: 43 };

function tree(route: Route): React.JSX.Element {
  return (
    <CatalogDisplayProvider prefs={PREFS}>
      <CollectionPage
        initialProducts={route.products}
        initialTotal={route.total}
        productFilter={{} as never}
        initialPage={route.page ?? 1}
        search={route.search}
      />
    </CatalogDisplayProvider>
  );
}

function names(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-testid="card"]')].map(
    (el) => el.textContent ?? "",
  );
}

function count(host: HTMLElement): string {
  return host.querySelector('[data-testid="count"]')?.textContent ?? "";
}

/** Mount once, then re-render at the same position — a client navigation. */
function mountThenNavigate(
  first: Route,
  second: Route,
): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(tree(first));
  });
  act(() => {
    root.render(tree(second));
  });
  return { host, root };
}

describe("CollectionPage across a same-route navigation", () => {
  it("shows the products of the route it is on, not the one it came from", () => {
    const { host, root } = mountThenNavigate(HELMET_ROUTE, GLOVES_ROUTE);

    expect(names(host)).toEqual(["Deep Scrubber Gloves"]);

    act(() => root.unmount());
    host.remove();
  });

  it("carries the new route's total and page, not the previous cursor", () => {
    const { host, root } = mountThenNavigate(
      { ...HELMET_ROUTE, page: 2 },
      GLOVES_ROUTE,
    );

    expect(count(host)).toBe("total:43 page:1");

    act(() => root.unmount());
    host.remove();
  });

  it("keeps what the shopper loaded when the same route re-renders", () => {
    // The deliberate other half: a revalidation of the SAME URL arrives as new
    // `initialProducts` on an unchanged route. Resetting there would throw away
    // the pages Load More had appended, so the grid must NOT follow it.
    const { host, root } = mountThenNavigate(HELMET_ROUTE, {
      ...HELMET_ROUTE,
      products: [product("Late Arrival Helmet")],
      total: 85,
    });

    expect(names(host)).toEqual(["Evade Helmet", "Hale Helmet"]);
    expect(count(host)).toBe("total:84 page:1");

    act(() => root.unmount());
    host.remove();
  });
});
