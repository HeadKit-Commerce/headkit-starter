import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ??= "pk_test";
  process.env.NEXT_PUBLIC_GRAPHQL_URL ??= "http://localhost:4000/graphql";
  process.env.HEADKIT_PRIVATE_KEY ??= "sk_test";
});

/**
 * The PLP heading outline, read off the rendered page.
 *
 * Collection cards use `h3` under a section `h2` ("Products", visually hidden)
 * so they match carousel cards (section `h2` → card `h3`) without skipping a
 * level after the collection `h1`. This test renders `CollectionHeader` and
 * `ProductGrid` the way `collection-page.tsx` composes them, and also checks
 * the carousel depth where the default `h3` stays correct.
 */

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("next/navigation", () => ({
  usePathname: (): string => "/shop/kitchen",
  useSearchParams: (): URLSearchParams => new URLSearchParams(),
  useRouter: (): { push: () => void; replace: () => void } => ({
    push: (): void => {},
    replace: (): void => {},
  }),
}));

// The collection provider fetches the next page through this server action.
// Nothing in this test paginates; the initial products are passed in directly.
vi.mock("@/lib/collection-actions", () => ({
  listCollectionProducts: async (): Promise<{
    products: unknown[];
    total: number;
  }> => ({ products: [], total: 0 }),
}));

// `InstantLink` calls `useLinkStatus`, which needs a Next router context that
// `renderToStaticMarkup` does not provide. The heading sits inside the link, so
// render it as a plain anchor and keep the subtree intact.
vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
  }: {
    href: string;
    children?: unknown;
  }): React.JSX.Element => <a href={href}>{children as React.ReactNode}</a>,
}));

import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";
import { CollectionProvider } from "@/components/headkit-ui/collection/collection-context";
import { ProductGrid } from "@/components/headkit-ui/collection/product-grid";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { CatalogDisplayProvider } from "@/components/headkit-ui/catalog-display-provider";
import type { CatalogProduct } from "@/lib/catalog-display";

const PREFS = {
  showVariants: true,
  showSwatches: false,
  imageRollover: false,
  defaultCollectionSort: "CREATED_AT",
};

function product(id: string, name: string): CatalogProduct {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    uri: `https://commerce.example.com/shop/kitchen/${id}/`,
    sku: `SKU-${id}`,
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
  } as unknown as CatalogProduct;
}

const PRODUCTS = [product("1", "Copper Kettle"), product("2", "Cast Iron Pan")];

/** The PLP as `collection-page.tsx` composes it: header, then grid. */
function renderPlp(): string {
  return renderToStaticMarkup(
    <CatalogDisplayProvider prefs={PREFS}>
      <CollectionHeader
        name="Kitchen"
        description=""
        childBasePath="/collections/kitchen"
      />
      <CollectionProvider
        initialProducts={PRODUCTS as never}
        initialTotal={PRODUCTS.length}
        productFilter={{} as never}
      >
        <ProductGrid />
      </CollectionProvider>
    </CatalogDisplayProvider>,
  );
}

/** Every heading in document order, as `{ level, text }`. */
function headingOutline(html: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({
      level: Number(m[1]),
      text: m[2]!.replace(/<[^>]*>/g, "").trim(),
    });
  }
  return out;
}

/** Text of every heading inside a `.headkit-product-card`, by tag name. */
function cardHeadings(html: string, tag: string): string[] {
  const out: string[] = [];
  const cards = html.matchAll(
    /<div class="[^"]*headkit-product-card[^"]*"[\s\S]*?(?=<div class="[^"]*headkit-product-card|$)/g,
  );
  for (const card of cards) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(card[0])) !== null) {
      out.push(m[1]!.replace(/<[^>]*>/g, "").trim());
    }
  }
  return out;
}

describe("PLP heading order", () => {
  it("renders the page h1, a Products h2, then product-name h3s — no skipped level", () => {
    const outline = headingOutline(renderPlp());

    expect(outline[0]).toEqual({ level: 1, text: "Kitchen" });
    expect(outline.slice(1)).toEqual([
      { level: 2, text: "Products" },
      { level: 3, text: "Copper Kettle" },
      { level: 3, text: "Cast Iron Pan" },
    ]);

    // The property the outline encodes: no heading jumps more than one level
    // below the one before it.
    for (let i = 1; i < outline.length; i++) {
      expect(
        outline[i]!.level - outline[i - 1]!.level,
        `heading "${outline[i]!.text}" (h${outline[i]!.level}) skips a level after h${outline[i - 1]!.level}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("puts the product name under the card hook the PLP e2e selector uses", () => {
    // `e2e/plp-filters.spec.ts` counts and reads cards through
    // `.headkit-product-card h3`. If the rendered level and that selector ever
    // disagree the suite goes green while matching nothing.
    const html = renderPlp();
    expect(cardHeadings(html, "h3")).toEqual([
      "Copper Kettle",
      "Cast Iron Pan",
    ]);
    expect(cardHeadings(html, "h2")).toEqual([]);
  });

  it("applies highlight face only on wishlist h2 cards", () => {
    // `titleAs` must stay in scope after the TitleTag alias — renaming the
    // prop at destructure (`titleAs: TitleTag`) made `highlight={titleAs ===
    // "h2"}` a TS2304 and a runtime ReferenceError. Wishlist is the only
    // surface that passes `h2`.
    const marked = product("3", "Monogram {Bath Sheet}");
    const wishlist = renderToStaticMarkup(
      <CatalogDisplayProvider prefs={PREFS}>
        <ProductCard product={marked} titleAs="h2" />
      </CatalogDisplayProvider>,
    );
    expect(wishlist).toContain("headkit-title-emphasis");
    expect(wishlist).toContain("Bath Sheet");
    expect(wishlist).not.toContain("{Bath Sheet}");

    const plp = renderToStaticMarkup(
      <CatalogDisplayProvider prefs={PREFS}>
        <ProductCard product={marked} titleAs="h3" />
      </CatalogDisplayProvider>,
    );
    expect(plp).not.toContain("headkit-title-emphasis");
    expect(plp).toContain("Monogram Bath Sheet");
    expect(plp).not.toContain("{");
  });

  it("keeps h3 for a card nested under a section heading (carousels)", () => {
    // A carousel card sits under a section `h2`; `h3` is correct there and an
    // unconditional `h2` would duplicate the section heading's level. The
    // default must stay the nested case.
    const html = renderToStaticMarkup(
      <CatalogDisplayProvider prefs={PREFS}>
        <h2>New arrivals</h2>
        <ProductCard product={PRODUCTS[0]!} />
      </CatalogDisplayProvider>,
    );
    expect(headingOutline(html)).toEqual([
      { level: 2, text: "New arrivals" },
      { level: 3, text: "Copper Kettle" },
    ]);
  });
});
