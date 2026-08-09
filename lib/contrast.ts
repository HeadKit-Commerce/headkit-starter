/**
 * WCAG relative-luminance / contrast helpers for the brand token block.
 *
 * These exist for exactly one decision: what colour text sits on a
 * primary-filled control. The root layout used to alias that unconditionally to
 * the brand BACKGROUND, which is correct only while the primary is dark. On a
 * light primary over a light background (a mint primary on white yields roughly
 * 1.7:1) every filled call to action became unreadable, and no branding value a
 * merchant can enter fixes it — hence a committed, general computation rather
 * than a per-store override.
 */

/** WCAG AA minimum contrast for normal text. */
export const MIN_CONTRAST_RATIO = 4.5;

const BLACK = "#000000";
const WHITE = "#ffffff";

/** Expands #rgb / #rrggbb / #rrggbbaa to 8-bit channels, or null if not hex. */
function hexChannels(value: string): [number, number, number] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("#")) return null;

  const body = trimmed.slice(1);
  const expanded =
    body.length === 3 || body.length === 4
      ? body
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : body;

  if (expanded.length !== 6 && expanded.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(expanded)) return null;

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return [r, g, b];
}

/** sRGB channel → linear-light value (WCAG 2.x). */
function linearize(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance of a hex colour, or null when the value is not hex
 * (a branding value may legitimately be an `rgb()` string — see safeColor).
 */
export function relativeLuminance(hexColor: string): number | null {
  const channels = hexChannels(hexColor);
  if (channels === null) return null;
  const [r, g, b] = channels;
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

/**
 * WCAG contrast ratio between two hex colours (1 to 21), or null when either
 * value is not hex.
 */
export function contrastRatio(
  foregroundHex: string,
  backgroundHex: string,
): number | null {
  const a = relativeLuminance(foregroundHex);
  const b = relativeLuminance(backgroundHex);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The colour for text sitting ON the brand primary.
 *
 * Replaces an unconditional alias to the brand background. The background value
 * is KEPT whenever it already clears {@link MIN_CONTRAST_RATIO} against the
 * primary — so every palette the old rule was correct for is byte-identical —
 * and only otherwise falls back to whichever of black or white scores higher
 * against the primary.
 *
 * A non-hex or absent primary leaves the existing behaviour untouched (returns
 * the background) rather than throwing: an unreadable button is a worse
 * outcome than a blank page, but a crashed root layout is worse than both.
 */
export function resolveOnPrimaryTextColor(
  primary: string | null | undefined,
  background: string,
): string {
  if (!primary) return background;

  const backgroundRatio = contrastRatio(background, primary);
  if (backgroundRatio === null) return background;
  if (backgroundRatio >= MIN_CONTRAST_RATIO) return background;

  const blackRatio = contrastRatio(BLACK, primary) ?? 0;
  const whiteRatio = contrastRatio(WHITE, primary) ?? 0;
  return blackRatio >= whiteRatio ? BLACK : WHITE;
}
