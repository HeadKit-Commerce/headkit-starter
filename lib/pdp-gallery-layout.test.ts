import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDP_GALLERY_LAYOUT,
  resolvePdpGalleryLayout,
} from "./pdp-gallery-layout";

describe("resolvePdpGalleryLayout", () => {
  it("defaults empty and unknown values to grid", () => {
    expect(DEFAULT_PDP_GALLERY_LAYOUT).toBe("grid");
    expect(resolvePdpGalleryLayout(undefined)).toBe("grid");
    expect(resolvePdpGalleryLayout(null)).toBe("grid");
    expect(resolvePdpGalleryLayout("")).toBe("grid");
    expect(resolvePdpGalleryLayout("  ")).toBe("grid");
    expect(resolvePdpGalleryLayout("masonry")).toBe("grid");
    expect(resolvePdpGalleryLayout("hero")).toBe("grid");
  });

  it("preserves the four built-in layouts", () => {
    expect(resolvePdpGalleryLayout("grid")).toBe("grid");
    expect(resolvePdpGalleryLayout("thumbnails")).toBe("thumbnails");
    expect(resolvePdpGalleryLayout("carousel")).toBe("carousel");
    expect(resolvePdpGalleryLayout("stack")).toBe("stack");
    expect(resolvePdpGalleryLayout("  thumbnails  ")).toBe("thumbnails");
  });
});
