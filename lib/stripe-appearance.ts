/**
 * Stripe Elements Appearance derived from dashboard brand CSS tokens.
 *
 * Layout injects `--color-primary`, `--radius`, `--background`, etc. on `:root`.
 * Stripe Appearance does not resolve CSS `var()` in all environments, so we
 * read computed values and pass concrete strings.
 */

import type { Appearance } from "@stripe/stripe-js";

const FALLBACKS = {
  primary: "#7f54b3",
  text: "#171717",
  radius: "0.5rem",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  danger: "#E01577",
} as const;

/**
 * Read a CSS custom property from `:root`, trimmed. Returns `fallback` when
 * unavailable (SSR) or empty.
 */
export function readBrandCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Resolved body font-family for Stripe (next/font slots are CSS vars Stripe
 * cannot follow — use the computed stack from `document.body`).
 */
export function readBodyFontFamily(fallback = FALLBACKS.fontFamily): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const family = getComputedStyle(document.body).fontFamily.trim();
  return family || fallback;
}

/**
 * Build Stripe Checkout / Elements Appearance from live brand tokens.
 */
export function buildCheckoutAppearance(): Appearance {
  const primary = readBrandCssVar("--color-primary", FALLBACKS.primary);
  const text = readBrandCssVar("--color-text", FALLBACKS.text);
  const radius = readBrandCssVar("--radius", FALLBACKS.radius);
  const fontFamily = readBodyFontFamily();

  return {
    theme: "flat",
    variables: {
      borderRadius: radius,
      focusBoxShadow: "none",
      colorPrimary: primary,
      colorBackground: "#FFFFFF",
      colorText: text,
      colorDanger: FALLBACKS.danger,
      fontFamily,
      colorTextPlaceholder: "#76766B",
    },
    rules: {
      ".AccordionItem": {
        padding: "4px",
      },
      ".Input": {
        padding: "11px 10px",
        outline: `1px solid ${primary}`,
        borderRadius: radius,
      },
      ".Input:focus": {
        outline: `2px solid ${primary}`,
        fontWeight: "500",
      },
      ".Input.Input--invalid": {
        outline: `2px solid ${FALLBACKS.danger}`,
      },
    },
  };
}
