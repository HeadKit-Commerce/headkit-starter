import { beforeEach, describe, expect, it, vi } from "vitest";

const homepageCarousels: Array<{
  image?: string | null;
  mobileImage?: string | null;
}> = [];

vi.mock("@/lib/homepage-data", () => ({
  getHomepageData: (): Promise<{
    homepage: { carousels: typeof homepageCarousels } | null;
  }> => Promise.resolve({ homepage: { carousels: homepageCarousels } }),
}));

import { getSiteShareImageUrl } from "./site-share-image";

beforeEach(() => {
  homepageCarousels.splice(0, homepageCarousels.length);
});

describe("getSiteShareImageUrl", () => {
  it("returns the first homepage hero raster", async () => {
    homepageCarousels.push({
      image: "https://cdn.shopify.com/files/Velvet_Hero.jpg",
    });
    await expect(getSiteShareImageUrl()).resolves.toBe(
      "https://cdn.shopify.com/files/Velvet_Hero.jpg",
    );
  });

  it("skips SVG so a later raster slide can win", async () => {
    homepageCarousels.push(
      { image: "https://cdn.example/hero.svg" },
      { image: "https://cdn.example/hero.jpg" },
    );
    await expect(getSiteShareImageUrl()).resolves.toBe(
      "https://cdn.example/hero.jpg",
    );
  });

  it("returns undefined when no raster hero exists", async () => {
    homepageCarousels.push({ image: "https://cdn.example/icon.svg" });
    await expect(getSiteShareImageUrl()).resolves.toBeUndefined();
  });
});
