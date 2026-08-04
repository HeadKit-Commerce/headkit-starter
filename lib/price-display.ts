import { getFloatVal } from "@/lib/utils";

/**
 * Pure display logic for catalog/PDP price rendering (F3).
 *
 * The strikethrough "regular" price must only render when there is a REAL
 * discount — i.e. a known regular price strictly greater than the current
 * price. Variable products often surface only a sale-derived price with
 * `regularPrice: ""` while `onSale` is true; naively falling back to the
 * current price produced fake "~~$24.00~~ $24.00" displays.
 */

export interface PriceDisplayInput {
  /** Current price; may be a range like "25 - 36". */
  price: string;
  /** Regular (pre-discount) price, if known. Empty/undefined = unknown. */
  regularPrice?: string | undefined;
  /** Provider on-sale flag. Necessary but NOT sufficient for a strikethrough. */
  onSale: boolean;
}

export interface PriceDisplay {
  /** Current price lower bound (or the single price). */
  min: number;
  /** Current price upper bound when a range, else null. */
  max: number | null;
  /**
   * Regular price to render struck-through, or null when no real discount
   * should be shown (unknown regular, regular <= current, ranges, not on sale).
   */
  struck: number | null;
}

/**
 * First non-empty price candidate, else "".
 *
 * The gateway serialises an absent sale price as an EMPTY STRING, not null —
 * so `a ?? b` chains keep `""` and downstream parsing renders A$0.00 (the
 * exact PDP regression E2E P1-14 catches on simple non-sale products). Use
 * this wherever a price is picked from fallbacks.
 */
export function pickFirstPrice(
  ...candidates: Array<string | null | undefined>
): string {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c.trim() !== "") return c;
  }
  return "";
}

/** Resolve what the price row should display, and whether a strikethrough regular price is warranted. */
export function getPriceDisplay({
  price,
  regularPrice,
  onSale,
}: PriceDisplayInput): PriceDisplay {
  const [minRaw, maxRaw] = (price ?? "").split("-");
  const min = getFloatVal(minRaw?.trim() ?? "");
  const hasRange = maxRaw !== undefined && maxRaw.trim() !== "";
  const max = hasRange ? getFloatVal(maxRaw.trim()) : null;

  const regular = getFloatVal(regularPrice ?? "");

  // Strikethrough only for a genuine discount on a single price point:
  // on sale, regular price known, and strictly greater than the current price.
  const struck = onSale && !hasRange && regular > min ? regular : null;

  return { min, max, struck };
}

/**
 * Card price for variable products: min–max across variation prices.
 * Includes $0 (free) variations — filtering `p > 0` dropped them and hid
 * ranges like "$0.00 – $2.00".
 */
export function getVariationCardPrice(input: {
  variations: Array<{ price?: string | null | undefined }>;
  fallbackPrice?: string | null | undefined;
  fallbackRegularPrice?: string | null | undefined;
}): { price: string; regularPrice: string } {
  const { variations, fallbackPrice, fallbackRegularPrice } = input;
  if (variations.length === 0) {
    return {
      price: pickFirstPrice(fallbackPrice) || "0",
      regularPrice: pickFirstPrice(fallbackRegularPrice) || "0",
    };
  }

  const prices = variations
    .map((v) => {
      const raw = (v.price ?? "").trim();
      if (raw === "") return Number.NaN;
      return Number.parseFloat(raw);
    })
    .filter((p) => Number.isFinite(p) && p >= 0);

  if (prices.length === 0) {
    return {
      price: pickFirstPrice(fallbackPrice) || "0",
      regularPrice: pickFirstPrice(fallbackRegularPrice) || "0",
    };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  if (minPrice === maxPrice) {
    return { price: String(minPrice), regularPrice: "" };
  }
  return { price: `${minPrice} - ${maxPrice}`, regularPrice: "" };
}
