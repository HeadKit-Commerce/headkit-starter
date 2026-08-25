import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";

/**
 * Nested shop PDP route — D-15-04 / RESEARCH C-6.
 *
 * These cases pin the properties a green build cannot prove:
 *  - `generateStaticParams` emits REAL nested params derived from each
 *    product's own permalink (asserted by count and by value, never by
 *    "not empty" — the placeholder alone would satisfy non-emptiness), and
 *    still degrades to exactly one placeholder when the catalogue read throws
 *  - a product's canonical is derived from the PRODUCT, not from the chain the
 *    request used, so a product filed in two categories has exactly one
 *  - a category URL under /shop does not acquire a product canonical (C-6);
 *    since the 2026-08-22 URL decision it canonicalises onto `/collections/…`,
 *    the one shape `app/sitemap.ts` advertises for a category
 */

const { SITE_URL, bailout } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url, bailout: { armed: false } };
});

const productsList = vi.fn();
const getCategories = vi.fn();
const getCategory = vi.fn();
const cachedProduct = vi.fn();
const storeDomain = vi.fn<() => string | null>(() => null);

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: (...a: unknown[]): unknown => productsList(...a) },
    collections: {
      getCategories: (): unknown => getCategories(),
      getCategory: (s: string): unknown => getCategory(s),
    },
  },
}));

vi.mock("@/lib/product-cache", () => ({
  getCachedProduct: (s: string): unknown => cachedProduct(s),
  // Delegates to the same fixture: with no Shopify preview key the real
  // `getProductForPage` IS `getCachedProduct`, and this route never passes one.
  getProductForPage: (s: string): unknown => cachedProduct(s),
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { ogImageUrl: null, allowIndexing: true },
      storeSettings: { name: "Acme", domain: storeDomain() },
    }),
  getBrandingAssets: (): Promise<unknown> => Promise.resolve({ iconUrl: null }),
}));

// Echo the canonical back through a real Metadata shape so the assertions
// below read the value the route actually asked for.
vi.mock("@/lib/make-metadata", async () => ({
  makeSeoMetadata: async (
    _seo: unknown,
    fallback: { canonical?: string; title?: string },
  ): Promise<Record<string, unknown>> => {
    // The real one reads the request Host, which throws a Next control-flow
    // signal during a prerender pass. `notFound()` throws one of the same
    // family, so the route's catch faces the real thing.
    if (bailout.armed) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    return {
      title: fallback?.title,
      alternates: { canonical: fallback?.canonical },
    };
  },
  resolveStoreName: (): string => "Acme",
  // Mirrors the real helper: the runtime store domain wins over the
  // build-time NEXT_PUBLIC_FRONTEND_URL.
  storefrontUrl: (path: string, domain?: string | null): string =>
    `${domain ? `https://${domain}` : SITE_URL}${path}`,
}));

// The route delegates BOTH rendering and product metadata to the flat PDP, so
// only the render half is stubbed. Keeping the real `generateMetadata` is the
// point: a stub would make these cases assert the stub rather than the
// canonical the storefront actually emits.
vi.mock("@/app/products/[...slug]/page", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ProductPageContent: (): null => null,
}));

// Pulled in by the flat PDP module: a Zod env parse at module scope that
// throws under Vitest, plus presentation-only children.
vi.mock("@/lib/stripe-config", () => ({
  getStripeConfig: (): Promise<unknown> =>
    Promise.resolve({
      publishableKey: "",
      accountId: "",
      bnplMessagingEnabled: false,
    }),
}));
vi.mock("@/components/headkit-ui/product-detail", () => ({
  ProductDetail: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-stock", () => ({
  ProductStock: (): null => null,
}));
vi.mock("@/components/headkit-ui/product-carousel", () => ({
  ProductCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/project/project-carousel", () => ({
  ProjectCarousel: (): null => null,
}));
vi.mock("@/components/headkit-ui/section-header", () => ({
  SectionHeader: (): null => null,
}));
vi.mock("@/components/seo/product-json-ld", () => ({
  ProductJsonLD: (): null => null,
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: (): null => null }));
vi.mock("@/app/products/[...slug]/product-page-shell", () => ({
  ProductPageShell: (): null => null,
}));
vi.mock("@/app/collections/[...slug]/page", () => ({
  CollectionRoute: (): null => null,
}));

import { generateMetadata, generateStaticParams } from "./page";

const TREE = [
  { slug: "clothing", children: [{ slug: "hoodies", children: [] }] },
  { slug: "accessories", children: [] },
];

function page(products: unknown[], totalPages = 1) {
  return { products, totalPages };
}

beforeEach(() => {
  bailout.armed = false;
  productsList.mockReset();
  getCategories.mockReset();
  getCategory.mockReset();
  cachedProduct.mockReset();
  storeDomain.mockReset();
  storeDomain.mockReturnValue(null);
  getCategories.mockResolvedValue(TREE);
});

describe("generateStaticParams", () => {
  it("emits one nested param per product, derived from the product's own permalink", async () => {
    productsList.mockResolvedValue(
      page([
        {
          slug: "blue-hoodie",
          uri: `https://commerce.example.com/shop/clothing/hoodies/blue-hoodie/`,
        },
        {
          slug: "red-tee",
          uri: `https://commerce.example.com/shop/clothing/red-tee/`,
        },
        { slug: "cap", uri: `/shop/accessories/cap/` },
      ]),
    );

    const params = await generateStaticParams();

    expect(
      params.length,
      "a count, not non-emptiness: the single placeholder entry would satisfy 'not empty' while prerendering zero real products (CONTEXT trap 10)",
    ).toBe(3);
    expect(
      params,
      "each param must be the permalink's own nested segment array, with the shop prefix stripped — a synthesised flat guess is what D-15-04 replaces",
    ).toEqual([
      { slug: ["clothing", "hoodies", "blue-hoodie"] },
      { slug: ["clothing", "red-tee"] },
      { slug: ["accessories", "cap"] },
    ]);
  });

  it("skips products whose permalink is not under the shop prefix", async () => {
    productsList.mockResolvedValue(
      page([
        {
          slug: "blue-hoodie",
          uri: "https://commerce.example.com/shop/clothing/blue-hoodie/",
        },
        // A store on WooCommerce's default /product/ permalink base: this app
        // has no route serving it, so it must not be prerendered here.
        {
          slug: "off-base",
          uri: "https://commerce.example.com/product/off-base/",
        },
        { slug: "no-uri", uri: "" },
      ]),
    );

    const params = await generateStaticParams();

    expect(
      params,
      "a permalink outside /shop must be skipped, not coerced into a shop path — coercing would prerender a URL the app answers 404 for on every non-shop-permalink store",
    ).toEqual([{ slug: ["clothing", "blue-hoodie"] }]);
  });

  it("returns exactly one placeholder when the catalogue read throws", async () => {
    productsList.mockRejectedValue(new Error("gateway unreachable"));

    const params = await generateStaticParams();

    expect(
      params.length,
      "Cache Components forbids an empty generateStaticParams; a transient backend failure at build must not fail the whole tenant deploy (T-15.1-07-03)",
    ).toBe(1);
    expect(
      params[0]?.slug[0],
      "the single entry must be the placeholder, which metadata and the page resolve to noindex/not-found",
    ).toBe("__hk_static_placeholder");
  });

  it("paginates the product list to completion", async () => {
    productsList
      .mockResolvedValueOnce(page([{ slug: "a", uri: "/shop/clothing/a/" }], 2))
      .mockResolvedValueOnce(
        page([{ slug: "b", uri: "/shop/clothing/b/" }], 2),
      );

    const params = await generateStaticParams();

    expect(
      params.length,
      "stopping after page 1 silently truncates the catalogue — the flat PDP paginates to completion and this route must match it",
    ).toBe(2);
  });
});

/** A product whose WooCommerce permalink files it under clothing/hoodies. */
/**
 * A product whose permalink runs through ancestry the truncated tree does not
 * contain (`outerwear` is absent, `jackets` promoted to a root).
 */
function parkaProduct(): Record<string, unknown> {
  return {
    name: "Parka",
    slug: "parka",
    uri: "https://commerce.example.com/shop/outerwear/jackets/parka/",
    shortDescription: "",
    description: "",
    seo: null,
  };
}

function nestedProduct(): Record<string, unknown> {
  return {
    name: "Blue Hoodie",
    slug: "blue-hoodie",
    uri: "https://commerce.example.com/shop/clothing/hoodies/blue-hoodie/",
    shortDescription: "",
    description: "",
    seo: null,
  };
}

describe("generateMetadata", () => {
  it("canonicalises a nested product URL to the NESTED path", async () => {
    cachedProduct.mockResolvedValue(nestedProduct());

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies", "blue-hoodie"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "the canonical must name the nested URL — pointing it at the flat /products path re-creates the very consolidation D-15-04 refuses",
    ).toBe(`${SITE_URL}/shop/clothing/hoodies/blue-hoodie`);
  });

  it("gives a product in two categories ONE canonical, whichever chain was entered", async () => {
    // The product is reachable under both chains; only the chain inside its own
    // permalink is canonical. Deriving the canonical from the REQUESTED path
    // would make each reachable chain declare itself an original — the same
    // duplicate split this consolidation closes, in a new shape.
    cachedProduct.mockResolvedValue(nestedProduct());

    const viaOwnChain = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies", "blue-hoodie"] }),
    });
    const viaOtherChain = await generateMetadata({
      params: Promise.resolve({ slug: ["accessories", "blue-hoodie"] }),
    });

    const canonical = (m: Metadata): string | undefined =>
      (m.alternates as { canonical?: string } | undefined)?.canonical;

    expect(canonical(viaOwnChain)).toBe(
      `${SITE_URL}/shop/clothing/hoodies/blue-hoodie`,
    );
    expect(
      canonical(viaOtherChain),
      "the second entry point must consolidate onto the first, not canonicalise itself",
    ).toBe(canonical(viaOwnChain));
  });

  it("canonicalises a colourway URL beneath the product's own nested path", async () => {
    // A colourway must be a REAL variation option: the delegated metadata
    // noindexes an unknown colour segment rather than canonicalising a URL the
    // store has no page for.
    cachedProduct.mockResolvedValue({
      ...nestedProduct(),
      type: "variable",
      attributes: [
        {
          slug: "pa_color",
          variation: true,
          fullOptions: [{ name: "Red", slug: "red" }],
        },
      ],
      variations: [
        { attributes: [{ key: "pa_color", value: "red" }], image: { src: "" } },
      ],
      image: { src: "" },
    });

    const meta = await generateMetadata({
      params: Promise.resolve({
        slug: ["clothing", "hoodies", "blue-hoodie", "red"],
      }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "a colourway is one segment on the canonical base — leaving it on /products would strand it under a path that 308s",
    ).toBe(`${SITE_URL}/shop/clothing/hoodies/blue-hoodie/red`);
  });

  it("keeps a product with no shop permalink on the flat path", async () => {
    // A store on WooCommerce's default `/product/` permalink base has no nested
    // route here. Its canonical is the flat path, which serves and does not
    // redirect — the no-ancestry case must stay reachable and self-consistent.
    cachedProduct.mockResolvedValue({
      ...nestedProduct(),
      uri: "https://commerce.example.com/product/blue-hoodie/",
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["blue-hoodie"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
    ).toBe(`${SITE_URL}/products/blue-hoodie`);
  });

  it("builds the canonical from the runtime store domain, not the baked env", async () => {
    // app/sitemap.ts already emits every <loc> from resolveSiteUrl(store
    // domain), so a canonical still resolved from the build-time env points
    // the storefront's largest URL class at a host the sitemap never
    // advertises whenever a custom domain is attached without a redeploy.
    storeDomain.mockReturnValue("customer.com");
    cachedProduct.mockResolvedValue(nestedProduct());

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies", "blue-hoodie"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
    ).toBe("https://customer.com/shop/clothing/hoodies/blue-hoodie");
  });

  it("canonicalises a category URL to its COLLECTIONS path and never to a product", async () => {
    getCategory.mockResolvedValue({
      name: "Hoodies",
      slug: "hoodies",
      description: "",
      seo: null,
      ancestors: [{ name: "Clothing", slug: "clothing" }],
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "hoodies"] }),
    });

    const canonical = (meta.alternates as { canonical?: string } | undefined)
      ?.canonical;

    expect(
      canonical,
      "a category archive's one canonical is its /collections path — the shape app/sitemap.ts advertises and the collection view links its facets under. Naming this /shop URL instead leaves a category with two self-declared originals",
    ).toBe(`${SITE_URL}/collections/clothing/hoodies`);
    expect(
      cachedProduct,
      "RESEARCH C-6: a category path must never trigger a product lookup — that lookup returning null is what produced the 308-into-404",
    ).not.toHaveBeenCalled();
  });

  it("propagates a Next control-flow signal instead of baking noindex", async () => {
    // This catch's fallback is an ACTIVE de-index, so swallowing the dynamic
    // bailout does not merely drop metadata: Next never learns the route is
    // dynamic and freezes `noindex, nofollow` into every prerendered /shop/*
    // shell, on the store's own live domain, while robots.txt allows /shop/*.
    bailout.armed = true;
    cachedProduct.mockResolvedValue({
      name: "Blue Hoodie",
      slug: "blue-hoodie",
      shortDescription: "",
      description: "",
      seo: null,
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({
          slug: ["clothing", "hoodies", "blue-hoodie"],
        }),
      }),
      "the route catch must not convert the signal into a resolved noindex",
    ).rejects.toThrow();
  });

  it("propagates it from the category branch too", async () => {
    bailout.armed = true;
    getCategory.mockResolvedValue({
      name: "Hoodies",
      slug: "hoodies",
      description: "",
      seo: null,
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: ["clothing", "hoodies"] }),
      }),
    ).rejects.toThrow();
  });

  it("returns noindex for a path that resolves to no product", async () => {
    // Two segments off an empty chain are read as product + colourway (see
    // shop-slug.test.ts); the product lookup is what rejects garbage. The
    // page a crawler gets is the same noindex/not-found either way.
    cachedProduct.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["not-a-category", "blue-hoodie"] }),
    });

    expect(
      meta.robots,
      "a path that names no product must be noindex, never a canonical for a page that does not exist",
    ).toEqual({ index: false, follow: false });
  });

  it("canonicalises a product whose ancestry was PROMOTED OUT of the category tree", async () => {
    // The promoted-orphan shape (`260822-commerce-category-list-orphan-promotion`):
    // commerce builds the forest from WooCommerce's un-paginated,
    // `hide_empty=true` category list, so `jackets` here is a ROOT with no
    // ancestors while WordPress still mints the permalink through `outerwear`.
    // Every signal names `/shop/outerwear/jackets/parka` — canonical, sitemap,
    // generateStaticParams, and the 308 from `/products/parka`. Refusing to
    // resolve it left the product with NO working address at all.
    getCategories.mockResolvedValue([
      ...TREE,
      { slug: "jackets", children: [] },
    ]);
    cachedProduct.mockImplementation((slug: string) =>
      Promise.resolve(slug === "parka" ? parkaProduct() : null),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["outerwear", "jackets", "parka"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "a permalink whose ancestry is missing from the truncated tree must still resolve — the flat URL now 308s onto this one, so 404ing it leaves the product unreachable",
    ).toBe(`${SITE_URL}/shop/outerwear/jackets/parka`);
  });

  it("canonicalises the COLOURWAY of a promoted-orphan product too", async () => {
    // Same truncated tree, one segment longer. `productPath(product, colour)`
    // appends the colour to the same unresolvable ancestry, so this shape is
    // every swatch href, every `hasVariant[].offers.url`, and the 308 target of
    // `/products/parka/red`. Reading only the LAST segment made `red` the
    // product slug, the lookup missed, and a URL that used to serve 200 began
    // redirecting permanently onto a 404 — the identical failure the base-PDP
    // containment closed, one segment along.
    getCategories.mockResolvedValue([
      ...TREE,
      { slug: "jackets", children: [] },
    ]);
    // Only `parka` is a product. `red` is a colour, so the FIRST candidate
    // misses and the second must be tried — a mock that answered every slug
    // would hide exactly the bug this pins.
    cachedProduct.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === "parka"
          ? {
              ...parkaProduct(),
              type: "variable",
              attributes: [
                {
                  slug: "pa_color",
                  variation: true,
                  fullOptions: [{ name: "Red", slug: "red" }],
                },
              ],
              variations: [
                {
                  attributes: [{ key: "pa_color", value: "red" }],
                  image: { src: "" },
                },
              ],
              image: { src: "" },
            }
          : null,
      ),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({
        slug: ["outerwear", "jackets", "parka", "red"],
      }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "the colourway of a promoted-orphan product must resolve — the catalogue is what separates the colour segment from the product slug, and without the second candidate every colourway URL on such a store 404s",
    ).toBe(`${SITE_URL}/shop/outerwear/jackets/parka/red`);
  });

  it("returns noindex when the slug a long path resolves to is no product", async () => {
    // The classifier degrades rather than refusing, so the CATALOGUE LOOKUP is
    // what rejects garbage — the same separation that guards a two-segment
    // remainder. `c` is not a product, so the page is noindex/not-found.
    cachedProduct.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["clothing", "a", "b", "c"] }),
    });

    expect(
      meta.robots,
      "a path naming no product must be noindex, never a canonical for a page that does not exist",
    ).toEqual({ index: false, follow: false });
    expect(
      cachedProduct.mock.calls.flat().slice(0, 2),
      "the lookup is what separates a real slug from garbage, so BOTH candidate readings must actually be tried — base PDP first, then product + colourway — before the route gives up",
    ).toEqual(["c", "b"]);
  });

  it("REFUSES a junk prefix in front of a real product slug", async () => {
    // Regression, and not confined to truncated-tree stores: this URL space is
    // unbounded, so serving it 200 is the opposite of what the canonical
    // decision protects. `blue-hoodie` IS a product, so slug existence alone
    // accepts it — the permalink comparison is what rejects it.
    cachedProduct.mockImplementation((slug: string) =>
      Promise.resolve(slug === "blue-hoodie" ? nestedProduct() : null),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({
        slug: ["anything", "anything", "blue-hoodie"],
      }),
    });

    expect(
      meta.robots,
      "the product's own permalink is /shop/clothing/hoodies/blue-hoodie, which is not what was requested, so this path names no page and must never render one",
    ).toEqual({ index: false, follow: false });
  });

  it("REFUSES a colourway path whose colour segment is itself a product slug", async () => {
    // A store selling a product slugged `red` used to be served AT the colourway
    // URL of a different product, because the first candidate reading only had
    // to exist. The permalink comparison makes the choice exact instead.
    getCategories.mockResolvedValue([
      ...TREE,
      { slug: "jackets", children: [] },
    ]);
    cachedProduct.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === "red"
          ? {
              ...nestedProduct(),
              name: "Red",
              slug: "red",
              uri: "https://commerce.example.com/shop/clothing/tees/red/",
            }
          : null,
      ),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({
        slug: ["outerwear", "jackets", "parka", "red"],
      }),
    });

    expect(
      meta.robots,
      "`red` exists but its permalink is /shop/clothing/tees/red — serving it here would answer one product's colourway URL with an unrelated product, and canonicalise it somewhere else again",
    ).toEqual({ index: false, follow: false });
  });

  it("resolves the TWO-segment truncated-tree shape: parent present, child absent", async () => {
    // `outerwear` is in the tree, `jackets` fell outside the category page, so
    // the chain breaks after one segment and the remainder is exactly two. The
    // validated reading (`jackets` + colourway `parka`) misses the catalogue;
    // the containment reading resolves and its permalink matches.
    getCategories.mockResolvedValue([
      ...TREE,
      { slug: "outerwear", children: [] },
    ]);
    cachedProduct.mockImplementation((slug: string) =>
      Promise.resolve(slug === "parka" ? parkaProduct() : null),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["outerwear", "jackets", "parka"] }),
    });

    expect(
      (meta.alternates as { canonical?: string } | undefined)?.canonical,
      "a two-segment remainder is the same truncated-tree family as the longer ones — 404ing it leaves the product with no working address, because the flat URL 308s onto this path",
    ).toBe(`${SITE_URL}/shop/outerwear/jackets/parka`);
  });

  it("returns noindex for a chain that ends on WooCommerce's default category", async () => {
    // `/shop/uncategorised` validates as ANCESTRY but is not a browsable
    // archive, so the remainder is empty and there is no slug to look up.
    // Reading one off the empty remainder produced `undefined`, which reached
    // the catalogue as a GetProduct query with the variable absent.
    //
    // The term must be IN the tree for this: that is what lets the walk consume
    // the whole path as ancestry while the archive test still refuses it.
    getCategories.mockResolvedValue([
      ...TREE,
      { slug: "uncategorised", children: [] },
    ]);
    cachedProduct.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["uncategorised"] }),
    });

    expect(meta.robots, "an undecidable path must be noindex").toEqual({
      index: false,
      follow: false,
    });
    expect(
      cachedProduct,
      "there is no product slug on this path, so the catalogue must not be queried at all — least of all with `undefined`",
    ).not.toHaveBeenCalled();
  });

  it("returns noindex for the build-time placeholder", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: ["__hk_static_placeholder"] }),
    });

    expect(
      meta.robots,
      "the placeholder is never a real URL and must never be indexable",
    ).toEqual({ index: false, follow: false });
  });
});
