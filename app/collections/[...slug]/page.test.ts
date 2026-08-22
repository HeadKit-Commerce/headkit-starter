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

const { SITE_URL } = vi.hoisted(() => {
  const url = "https://shop.example.com";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { SITE_URL: url };
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
}));

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

async function canonicalFor(slug: string[]): Promise<string | undefined> {
  const meta = await generateMetadata({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  });
  return (meta.alternates as { canonical?: string } | undefined)?.canonical;
}

const COLOR_FACET = encodeFilterSlug({
  ...DEFAULT_FILTER_VALUES,
  attributes: { pa_color: ["red"] },
});

beforeEach(() => {
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
