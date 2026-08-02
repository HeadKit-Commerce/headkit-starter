import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: vi.fn(), get: vi.fn() },
    collections: { list: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
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
  headingFont: { source: "", family: "", googleSlug: "", fileUrl: "" },
  subheadingFont: { source: "", family: "", googleSlug: "", fileUrl: "" },
  bodyFont: { source: "", family: "", googleSlug: "", fileUrl: "" },
  cornerStyle: "soft",
  iconLibrary: "hi2",
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
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: false,
        allowIndexing: true,
      },
    });

    await expect(sitemap()).resolves.toEqual([]);
  });
});

describe("robots allowIndexing + enableSitemap", () => {
  beforeEach(() => {
    mockedGetBranding.mockReset();
    process.env.NEXT_PUBLIC_FRONTEND_URL = "https://shop.example";
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
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: false,
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
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: false,
        allowIndexing: true,
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
      },
      seoSettings: {
        title: null,
        description: null,
        ogImageUrl: null,
        enableSitemap: true,
        allowIndexing: true,
      },
    });

    const result = await robots();
    expect(result.sitemap).toBe("https://shop.example/sitemap.xml");
  });
});
