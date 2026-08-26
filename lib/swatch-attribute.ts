/**
 * Detect product attributes that should render as colour swatches.
 *
 * Signals (in order):
 * 1. WooCommerce attribute `type` when present on ProductAttribute (color,
 *    colour, swatch, wc-visual, visual) — requires commerce + gateway deploy
 * 2. Legacy `pa_color` / `pa_colour` slugs, plus Shopify `color` / `colour`
 * 3. Any option with a configured `swatchColor` or `swatchImage`
 */

const SWATCH_ATTRIBUTE_TYPES = new Set([
  "color",
  "colour",
  "swatch",
  "wc-visual",
  "visual",
]);

export interface SwatchAttributeLike {
  slug: string;
  type?: string | null;
  fullOptions?: ReadonlyArray<{
    swatchColor?: string | null;
    swatchImage?: string | null;
  }> | null;
}

/** True when the attribute should use circle swatch UI (not text chips). */
export function isSwatchAttribute(attr: SwatchAttributeLike): boolean {
  const type = (attr.type ?? "").trim().toLowerCase();
  if (SWATCH_ATTRIBUTE_TYPES.has(type)) {
    return true;
  }
  // Woo taxonomy slugs and Shopify option slugs (Color → "color").
  if (
    attr.slug === "pa_color" ||
    attr.slug === "pa_colour" ||
    attr.slug === "color" ||
    attr.slug === "colour"
  ) {
    return true;
  }
  return (attr.fullOptions ?? []).some(
    (o) => Boolean(o.swatchColor) || Boolean(o.swatchImage),
  );
}

/** First variation attribute that should drive path-based / card swatches. */
export function findSwatchAttribute<T extends SwatchAttributeLike>(
  attributes: ReadonlyArray<T>,
): T | undefined {
  return attributes.find((a) => isSwatchAttribute(a));
}
