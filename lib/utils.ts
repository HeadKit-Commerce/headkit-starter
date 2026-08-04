import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Decode common HTML entities in provider-sourced titles/labels.
 * WooCommerce often returns names with `&amp;` etc. that must not render literally.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#036;/g, "$")
    .replace(/&#0*38;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function addAlphaToHex(hex: string, alpha: number): string {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Strip any non-numeric/decimal characters and return as float. */
export function getFloatVal(str: string | null | undefined): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Store display currency for surfaces with NO cart/order context (F6).
 *
 * The commerce graph only exposes `Currency` on Cart and Order — products and
 * store settings carry no currency — so catalog components (ProductPrice etc.)
 * have no runtime source and must fall back to a deploy-level constant.
 * Configured per store via `NEXT_PUBLIC_STORE_CURRENCY` (ISO 4217); defaults
 * to AUD, matching the platform's other defaults (product-json-ld,
 * checkout-page-content) — the old "USD" default silently mislabelled catalog
 * prices for every non-USD store while the cart showed the real currency.
 *
 * NOTE: read via `process.env` directly (not `lib/env.ts`) because this module
 * is imported by nearly every component AND by node-env unit tests, where the
 * zod env parse would throw. `NEXT_PUBLIC_*` is statically inlined client-side.
 */
export function getStoreCurrency(): string {
  return process.env.NEXT_PUBLIC_STORE_CURRENCY || "AUD";
}

/**
 * Format a numeric price with currency symbol using Intl.NumberFormat.
 * Pass the cart/order `currency.code` when one exists; omitting `currency`
 * falls back to the store display currency ({@link getStoreCurrency}).
 */
export function formatPrice(
  value: number,
  currency?: string,
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || getStoreCurrency(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
