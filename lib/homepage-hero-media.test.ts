import { describe, expect, it } from "vitest";
import { homepageHeroMediaPending } from "./homepage-hero-media";

describe("homepageHeroMediaPending", () => {
  it("is false when homepage or carousels are missing", () => {
    expect(homepageHeroMediaPending(null)).toBe(false);
    expect(homepageHeroMediaPending({})).toBe(false);
    expect(homepageHeroMediaPending({ carousels: [] })).toBe(false);
  });

  it("is false for a slide with no shopper-facing copy", () => {
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            header: "",
            title: "",
            buttonText: "",
            image: "",
            video: "",
          },
        ],
      }),
    ).toBe(false);
  });

  it("is true when a slide has copy but no media URLs", () => {
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            header: "A new era of Towel",
            title: "Soft on one side.",
            buttonText: "Shop Velvet",
            image: "",
            mobileImage: "",
            video: "",
            mobileVideo: "",
          },
        ],
      }),
    ).toBe(true);
  });

  it("treats whitespace-only media as still pending", () => {
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            header: "Hero",
            image: "   ",
            mobileImage: "\n",
            video: "",
            mobileVideo: null,
          },
        ],
      }),
    ).toBe(true);
  });

  it("is false when any media URL is present", () => {
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            header: "Hero",
            image: "https://cdn.shopify.com/ready.jpg",
          },
        ],
      }),
    ).toBe(false);
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            title: "Hero",
            video: "https://cdn.shopify.com/ready.mp4",
          },
        ],
      }),
    ).toBe(false);
  });

  it("is true when any slide in a mixed carousel is still empty", () => {
    expect(
      homepageHeroMediaPending({
        carousels: [
          {
            header: "Ready",
            image: "https://cdn.shopify.com/ready.jpg",
          },
          {
            header: "Pending",
            image: "",
            video: "",
          },
        ],
      }),
    ).toBe(true);
  });
});
