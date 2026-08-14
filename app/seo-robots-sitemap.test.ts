import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: vi.fn(), get: vi.fn() },
    collections: {
      list: vi.fn(),
      getCategories: vi.fn(async () => []),
      getFilters: vi.fn(async () => ({ attributes: [] })),
    },
    brands: { list: vi.fn(async () => ({ brands: [] })) },
    posts: {
      list: vi.fn(async () => ({ posts: [] })),
      // sitemap() → getPostsBasePath() → posts.getLanding(); `null` is the
      // unset-Posts-page case and falls back to DEFAULT_POSTS_BASE_PATH.
      getLanding: vi.fn(async () => null),
    },
    projects: { list: vi.fn(async () => ({ projects: [] })) },
  },
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

const SITE_URL = "https://shop.example";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_FRONTEND_URL: "https://shop.example" },
}));

// Mutable per test — robots() decides on the request Host header first.
let requestHost = "shop.example";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: requestHost })),
}));

import { getBranding, type Branding } from "@/lib/branding";
import sitemap from "./sitemap";
import robots from "./robots";

const mockedGetBranding = vi.mocked(getBranding);

const stubBranding: Branding = {
  primaryColor: "#000",
  secondaryColor: "#fff",
  backgroundColor: "#ffffff",
  textColor: "#171717",
  logoUrl: null,
  iconUrl: null,
  headingFont: {
    source: "",
    family: "",
    googleSlug: "",
    fileUrl: "",
    googleWeights: [],
  },
  subheadingFont: {
    source: "",
    family: "",
    googleSlug: "",
    fileUrl: "",
    googleWeights: [],
  },
  bodyFont: {
    source: "",
    family: "",
    googleSlug: "",
    fileUrl: "",
    googleWeights: [],
  },
  cornerStyle: "soft",
  iconLibrary: "hi2",
  showVariants: true,
  showSwatches: false,
  imageRollover: false,
  hideEmptyCollections: true,
  defaultCollectionSort: "CREATED_AT",
};

describe("sitemap enableSitemap gate", () => {
  beforeEach(() => {
    mockedGetBranding.mockReset();
  });

  it("returns empty array when enableSitemap is false", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: null,
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: false,
        allowIndexing: true,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });

    await expect(sitemap()).resolves.toEqual([]);
  });

  it("roots every loc under the runtime store domain when env still has the headkit host", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: "paralelfurniture.com.au",
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: true,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });

    const { headkit } = await import("@/lib/sdk");
    vi.mocked(headkit.products.list).mockResolvedValue({
      products: [],
      totalPages: 0,
    } as never);

    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every((e) => e.url.startsWith("https://paralelfurniture.com.au")),
      "stale NEXT_PUBLIC_FRONTEND_URL must not win over Store.domain",
    ).toBe(true);
    expect(entries.some((e) => e.url.includes("headkit.app"))).toBe(false);
  });
});

const permissiveSeo = {
  branding: stubBranding,
  storeSettings: {
    id: null,
    slug: null,
    name: "Acme",
    gtmId: null,
    domain: null,
    checkoutType: null,
  },
  seoSettings: {
    title: null,
    description: null,
    ogImageUrl: null,
    enableSitemap: true,
    allowIndexing: true,
    indexNowEnabled: false,
    indexNowKey: null,
  },
} satisfies Awaited<ReturnType<typeof getBranding>>;

const DISALLOW_EVERYTHING = [{ userAgent: "*", disallow: "/" }];

describe("robots host gate (MIG-03)", () => {
  beforeEach(() => {
    mockedGetBranding.mockReset();
    requestHost = "shop.example";
  });

  it("disallows everything and omits the sitemap on a TEMP host even when branding reports both gates ENABLED", async () => {
    mockedGetBranding.mockResolvedValue(permissiveSeo);
    requestHost = "acme-rehearsal.vercel.app";

    const result = await robots();

    expect(
      result.rules,
      "the rehearsal host must serve Disallow: / regardless of branding — branding's default bundle is permissive and is returned on any failure",
    ).toEqual(DISALLOW_EVERYTHING);
    expect(
      result.sitemap,
      "the rehearsal host must not advertise a sitemap of the live catalogue",
    ).toBeUndefined();
  });

  it("disallows everything when the branding read THROWS — a failed read must close, not open", async () => {
    mockedGetBranding.mockRejectedValue(new Error("dashboard-api unreachable"));

    const result = await robots();

    expect(
      result.rules,
      "a thrown branding read must not fall through to the permissive ruleset",
    ).toEqual(DISALLOW_EVERYTHING);
    expect(
      result.sitemap,
      "no sitemap on a failed branding read",
    ).toBeUndefined();
  });

  it("disallows everything when the Host header is absent", async () => {
    mockedGetBranding.mockResolvedValue(permissiveSeo);
    requestHost = "";

    const result = await robots();

    expect(
      result.rules,
      "a missing Host header is an unknown host and must fail closed",
    ).toEqual(DISALLOW_EVERYTHING);
  });

  it("INVERTS on the production host: permissive ruleset WITH the sitemap line", async () => {
    mockedGetBranding.mockResolvedValue(permissiveSeo);
    requestHost = "shop.example";

    const result = await robots();

    expect(
      result.rules,
      "the live host must stay indexable — a closed posture here costs the merchant their search presence",
    ).not.toEqual(DISALLOW_EVERYTHING);
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("robots allowIndexing + enableSitemap", () => {
  beforeEach(() => {
    mockedGetBranding.mockReset();
    requestHost = "shop.example";
  });

  it("Disallow all and omits sitemap when allowIndexing is false", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: null,
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: false,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });

    const result = await robots();
    expect(result.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(result.sitemap).toBeUndefined();
  });

  it("omits Sitemap line when enableSitemap is false", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: null,
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: false,
        allowIndexing: true,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });

    const result = await robots();
    expect(result.sitemap).toBeUndefined();
    expect(Array.isArray(result.rules)).toBe(true);
  });

  it("advertises sitemap when enableSitemap and allowIndexing are true", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: null,
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: true,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });

    const result = await robots();
    expect(result.sitemap).toBe("https://shop.example/sitemap.xml");
  });

  it("prefers the runtime store domain over a stale NEXT_PUBLIC_FRONTEND_URL", async () => {
    mockedGetBranding.mockResolvedValue({
      branding: stubBranding,
      storeSettings: {
        id: null,
        slug: null,
        name: "Acme",
        gtmId: null,
        domain: "paralelfurniture.com.au",
        checkoutType: null,
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: true,
        indexNowEnabled: false,
        indexNowKey: null,
      },
    });
    requestHost = "paralelfurniture.com.au";

    const result = await robots();

    expect(result.host).toBe("https://paralelfurniture.com.au");
    expect(result.sitemap).toBe("https://paralelfurniture.com.au/sitemap.xml");
    expect(result.rules).not.toEqual(DISALLOW_EVERYTHING);
  });
});
