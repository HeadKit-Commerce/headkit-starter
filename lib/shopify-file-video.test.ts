import { describe, expect, it } from "vitest";
import {
  isShopifyFileVideoUrl,
  rewriteShopifyFileVideos,
} from "./shopify-file-video";

const FILE = "https://cdn.shopify.com/videos/c/o/v/abc/lookbook.mp4?v=1";

describe("isShopifyFileVideoUrl", () => {
  it("accepts Shopify CDN video files", () => {
    expect(isShopifyFileVideoUrl(FILE)).toBe(true);
    expect(
      isShopifyFileVideoUrl("https://cdn.shopifycdn.net/s/files/a.webm"),
    ).toBe(true);
  });

  it("rejects other hosts and non-video files", () => {
    expect(isShopifyFileVideoUrl("https://evil.example/a.mp4")).toBe(false);
    expect(isShopifyFileVideoUrl("http://cdn.shopify.com/a.mp4")).toBe(false);
    expect(isShopifyFileVideoUrl("https://cdn.shopify.com/s/files/a.jpg")).toBe(
      false,
    );
    expect(isShopifyFileVideoUrl("https://www.youtube.com/watch?v=abc")).toBe(
      false,
    );
  });
});

describe("rewriteShopifyFileVideos", () => {
  it("turns a Shopify file iframe, link, or pasted URL into a video", () => {
    const iframe = rewriteShopifyFileVideos(
      `<iframe src="${FILE}" width="560" height="315"></iframe>`,
    );
    const link = rewriteShopifyFileVideos(`<a href="${FILE}">watch</a>`);
    const bare = rewriteShopifyFileVideos(`<p>${FILE}</p>`);
    for (const html of [iframe, link, bare]) {
      expect(html).toContain(`<video src="${FILE}"`);
      expect(html).toContain("controls");
      expect(html).toContain("playsinline");
    }
    expect(iframe).not.toContain("<iframe");
    expect(link).not.toContain("<a ");
  });

  it("leaves YouTube embeds alone", () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/abc" title="Film"></iframe>';
    expect(rewriteShopifyFileVideos(html)).toBe(html);
  });
});
