import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Collection canonical consolidation.
 *
 * The route resolves a category from the LAST slug segment, so
 * `/collections/child` and `/collections/parent/child` both serve the same
 * category and render identical content. Internal links use the flat shape
 * (category carousel, subcategory cards, block editor) while `app/sitemap.ts`
 * advertises the nested one, so both are live. A canonical built from the
 * REQUESTED path makes each shape declare itself the original; these cases pin
 * that every shape consolidates onto the one path the sitemap advertises.
 */

const { SITE_URL, bailout, BailoutSignal } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  /** Stands in for the control-flow error Next throws from a dynamic API. */
  class BailoutSignal extends Error {}
  return { SITE_URL: url, bailout: { armed: false }, BailoutSignal };
});

const getCategory = vi.fn();
const getFilters = vi.fn();

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("notFound");
  },
  permanentRedirect: (): never => {
    throw new Error("redirect");
  },
  // Mirrors the real one: rethrows Next's own control-flow signals, passes
  // ordinary errors through untouched.
  unstable_rethrow: (error: unknown): void => {
    if (error instanceof BailoutSignal) throw error;
  },
}));

// The facet `robots` meta is decided by the request Host (ENG-868 / ENG-876).
vi.mock("next/headers", async () => {
  const { currentRequestHeaders } =
    await import("@/lib/test-support/request-host");
  return {
    headers: async (): Promise<Headers> => {
      if (bailout.armed) throw new BailoutSignal("dynamic usage");
      return currentRequestHeaders();
    },
  };
});

vi.mock("@/lib/sdk", () => ({
  headkit: {
    collections: {
      getCategory: (slug: string): unknown => getCategory(slug),
      getFilters: (slug: string): unknown => getFilters(slug),
    },
    brands: { list: (): Promise<unknown> => Promise.resolve({ brands: [] }) },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { allowIndexing: true, ogImageUrl: null },
      storeSettings: { name: "Acme", domain: null },
    }),
}));

vi.mock("@/lib/hide-empty-collections", () => ({
  filterCategoriesByNonEmptySlugs: (c: unknown): unknown => c,
  getNonEmptyCollectionSlugs: (): Promise<null> => Promise.resolve(null),
}));

vi.mock("@/components/headkit-ui/collection/collection-header", () => ({
  CollectionHeader: (): null => null,
}));
vi.mock("@/components/headkit-ui/collection/collection-page", () => ({
  CollectionPage: (): null => null,
}));
vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));
vi.mock("@/components/headkit-ui/skeletons/collection-page-skeleton", () => ({
  CollectionPageSkeleton: (): null => null,
  CollectionProductsSkeleton: (): null => null,
}));
vi.mock("@/components/headkit-ui/catalog-grid", () => ({
  CATALOG_PAGE_SIZE: 24,
}));

import {
  DEFAULT_FILTER_VALUES,
  encodeFilterSlug,
} from "@/components/headkit-ui/collection/utils";
import { setRequestHost } from "@/lib/test-support/request-host";
import { generateMetadata } from "./page";

/** A category that lives at /collections/parent/child, whatever URL asked for it. */
function nestedCategory(): Record<string, unknown> {
  return {
    id: "2",
    name: "Child",
    slug: "child",
    description: "",
    thumbnail: "",
    uri: "",
    seo: null,
    children: [],
    ancestors: [
      {
        id: "1",
        name: "Parent",
        slug: "parent",
        description: "",
        thumbnail: "",
        uri: "",
        children: [],
        ancestors: [],
      },
    ],
  };
}

async function metadataFor(
  slug: string[],
): Promise<Awaited<ReturnType<typeof generateMetadata>>> {
  return await generateMetadata({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  });
}

async function canonicalFor(slug: string[]): Promise<string | undefined> {
  const meta = await metadataFor(slug);
  return (meta.alternates as { canonical?: string } | undefined)?.canonical;
}

const COLOR_FACET = encodeFilterSlug({
  ...DEFAULT_FILTER_VALUES,
  attributes: { pa_color: ["red"] },
});

beforeEach(() => {
  bailout.armed = false;
  // The store's own live host — branding mocks `domain: null`, so the origin
  // resolves from NEXT_PUBLIC_FRONTEND_URL above.
  setRequestHost(new URL(SITE_URL).host);
  getCategory.mockReset();
  getFilters.mockReset();
  getCategory.mockResolvedValue(nestedCategory());
  getFilters.mockResolvedValue({
    attributes: [{ slug: "pa_color", options: [{ slug: "red", name: "Red" }] }],
  });
});

describe("base collection canonical", () => {
  it("consolidates every serving URL shape onto the nested path", async () => {
    const flat = await canonicalFor(["child"]);
    const nested = await canonicalFor(["parent", "child"]);

    expect(
      flat,
      "the flat shape every internal link uses must point at the path the sitemap advertises, not at itself",
    ).toBe(`${SITE_URL}/collections/parent/child`);
    expect(nested).toBe(flat);
  });

  it("emits the bare path for a root category", async () => {
    getCategory.mockResolvedValue({ ...nestedCategory(), ancestors: [] });

    await expect(canonicalFor(["child"])).resolves.toBe(
      `${SITE_URL}/collections/child`,
    );
  });
});

describe("Tier-1 facet canonical", () => {
  it("consolidates every serving URL shape onto the nested facet path", async () => {
    const flat = await canonicalFor(["child", "f", COLOR_FACET]);
    const nested = await canonicalFor(["parent", "child", "f", COLOR_FACET]);

    expect(flat).toBe(`${SITE_URL}/collections/parent/child/f/${COLOR_FACET}`);
    expect(nested).toBe(flat);
  });
});

/**
 * ENG-868 / ENG-876: a Tier-1 facet URL is a deliberate SEO surface — it gets a
 * self-canonical, a facet title and a facet description precisely so it can be
 * indexed, and robots.txt allows `/collections/*`. Its `robots` meta must
 * therefore be judged against the store's own origin like every other surface;
 * omitting that origin made it `noindex, nofollow` on EVERY host, silently
 * de-indexing the page while robots.txt kept inviting the crawl.
 */
describe("Tier-1 facet robots", () => {
  it("indexes on the store's own host when the store switch is on", async () => {
    const meta = await metadataFor(["child", "f", COLOR_FACET]);

    expect(
      meta.robots,
      "the facet meta must not refuse the crawl robots.txt allows",
    ).toEqual({ index: true, follow: true });
  });

  it("noindexes the same URL on a rehearsal host", async () => {
    setRequestHost("acme-rehearsal.headkit.app");

    const meta = await metadataFor(["child", "f", COLOR_FACET]);

    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

/**
 * Metadata became request-time when the `robots` meta started consulting the
 * request Host, so Next's dynamic-access signal can now originate INSIDE
 * `generateMetadata`'s own try block. A `catch` that consumes it turns "mark
 * this render dynamic" into a page that silently loses its title, description
 * and canonical.
 */
describe("generateMetadata dynamic bailout", () => {
  it("propagates Next's bailout signal instead of degrading to empty metadata", async () => {
    bailout.armed = true;

    await expect(
      metadataFor(["parent", "child"]),
      "the route catch must not swallow the signal the host read re-throws",
    ).rejects.toBeInstanceOf(BailoutSignal);
  });

  it("propagates it from the Tier-1 facet branch too", async () => {
    bailout.armed = true;

    await expect(
      metadataFor(["child", "f", COLOR_FACET]),
    ).rejects.toBeInstanceOf(BailoutSignal);
  });
});

describe("Tier-2 filtered canonical", () => {
  it("points a non-indexable facet back at the nested base collection", async () => {
    const combo = encodeFilterSlug({
      ...DEFAULT_FILTER_VALUES,
      attributes: { pa_color: ["red", "blue"] },
    });

    await expect(canonicalFor(["child", "f", combo])).resolves.toBe(
      `${SITE_URL}/collections/parent/child`,
    );
  });
});
