import { describe, expect, it } from "vitest";
import {
  applyLightboxPan,
  LIGHTBOX_ZOOM_SCALE,
  lightboxCursorClass,
  lightboxImageTransform,
  nextLightboxScale,
} from "./lightbox-zoom";

describe("lightbox zoom", () => {
  it("zooms in to the fixed scale and out to 1", () => {
    expect(nextLightboxScale(1, "in")).toBe(LIGHTBOX_ZOOM_SCALE);
    expect(nextLightboxScale(LIGHTBOX_ZOOM_SCALE, "out")).toBe(1);
  });

  it("toggles between 1 and the zoomed scale", () => {
    expect(nextLightboxScale(1, "toggle")).toBe(LIGHTBOX_ZOOM_SCALE);
    expect(nextLightboxScale(LIGHTBOX_ZOOM_SCALE, "toggle")).toBe(1);
  });

  it("uses zoom-in, zoom-out, and grabbing cursors", () => {
    expect(lightboxCursorClass(1, false)).toBe("cursor-zoom-in");
    expect(lightboxCursorClass(2, false)).toBe("cursor-zoom-out");
    expect(lightboxCursorClass(2, true)).toBe("cursor-grabbing");
  });

  it("pans from the pointer delta", () => {
    expect(
      applyLightboxPan({ x: 10, y: 4 }, { x: 100, y: 50 }, { x: 130, y: 40 }),
    ).toEqual({ x: 40, y: -6 });
  });

  it("builds the image transform", () => {
    expect(lightboxImageTransform(2, { x: 12, y: -8 })).toBe(
      "translate(12px, -8px) scale(2)",
    );
  });
});
