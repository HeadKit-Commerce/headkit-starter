export const LIGHTBOX_ZOOM_SCALE = 2;

export type LightboxZoomDirection = "in" | "out" | "toggle";

export type LightboxPan = {
  x: number;
  y: number;
};

export function nextLightboxScale(
  scale: number,
  direction: LightboxZoomDirection,
): number {
  if (direction === "in") {
    return LIGHTBOX_ZOOM_SCALE;
  }
  if (direction === "out") {
    return 1;
  }
  return scale > 1 ? 1 : LIGHTBOX_ZOOM_SCALE;
}

export function lightboxCursorClass(scale: number, dragging: boolean): string {
  if (scale <= 1) {
    return "cursor-zoom-in";
  }
  if (dragging) {
    return "cursor-grabbing";
  }
  return "cursor-zoom-out";
}

export function applyLightboxPan(
  origin: LightboxPan,
  start: LightboxPan,
  current: LightboxPan,
): LightboxPan {
  return {
    x: origin.x + current.x - start.x,
    y: origin.y + current.y - start.y,
  };
}

export function lightboxImageTransform(
  scale: number,
  pan: LightboxPan,
): string {
  return `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
}
