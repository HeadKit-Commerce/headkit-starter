/**
 * Stripe Elements Appearance derived from dashboard brand CSS tokens.
 *
 * Layout injects `--color-primary`, `--radius`, `--background`, etc. on `:root`.
 * Stripe Appearance does not resolve CSS `var()` in all environments, so we
 * read computed values and pass concrete strings.
 */

import type { Appearance, CssFontSource } from "@stripe/stripe-js";

const FALLBACKS = {
  primary: "#7f54b3",
  text: "#171717",
  radius: "0.5rem",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  danger: "#E01577",
} as const;

/**
 * Path of the stylesheet handed to Stripe as `fonts: [{ cssSrc }]`.
 * @see app/api/brand-fonts/route.ts for what it serves and why it exists.
 */
const BRAND_FONTS_CSS_PATH = "/api/brand-fonts";

/**
 * Type sizes copied from the site's own form controls so Stripe's fields sit at
 * the same size as the ones beside them. Change these only alongside the
 * components they mirror.
 */
const SITE_TYPE = {
  /** `components/ui/input.tsx`: `text-base` below `md`. */
  inputFontSizeMobile: "16px",
  /** `components/ui/input.tsx`: `md:text-sm`. */
  inputFontSizeDesktop: "14px",
  /** `components/ui/label.tsx`: `text-sm font-medium`. */
  labelFontSize: "14px",
  labelFontWeight: "500",
  /** Tailwind's `md` breakpoint, which is where the input size changes. */
  desktopQuery: "(min-width: 48rem)",
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
 * The brand `@font-face` rules, as Stripe's `fonts` option.
 *
 * MUST be passed alongside {@link buildCheckoutAppearance}. The appearance's
 * `fontFamily` names the store's brand face, but Stripe Elements render in an
 * iframe on `js.stripe.com` and a `@font-face` declared on the parent page does
 * not cross an origin boundary — so without this the family name resolves to
 * nothing inside the iframe and Stripe silently falls back to the system stack,
 * which is exactly the reported mismatch between Stripe's fields and the site's.
 *
 * The URL is built from `window.location.origin`, the RUNTIME host, and never
 * from `NEXT_PUBLIC_FRONTEND_URL`: that env var is inlined at BUILD time, so on
 * a store whose custom domain was attached without a redeploy it still names
 * the old host (see the shopper-facing-URL rules in AGENTS.md). Returns an
 * empty list on the server, where there is no origin to build from — the
 * caller passes it inside a client-only `useMemo`, and an empty `fonts` array
 * is simply the pre-fix behaviour.
 */
export function buildCheckoutFonts(): CssFontSource[] {
  if (typeof window === "undefined") {
    return [];
  }
  return [
    { cssSrc: new URL(BRAND_FONTS_CSS_PATH, window.location.origin).href },
  ];
}

/**
 * Build Stripe Checkout / Elements Appearance from live brand tokens.
 *
 * Pair every call with {@link buildCheckoutFonts} — see its doc comment for why
 * the family name alone is not enough.
 */
export function buildCheckoutAppearance(): Appearance {
  const primary = readBrandCssVar("--color-primary", FALLBACKS.primary);
  const text = readBrandCssVar("--color-text", FALLBACKS.text);
  const radius = readBrandCssVar("--radius", FALLBACKS.radius);
  const fontFamily = readBodyFontFamily();
  const fontSizeBase = readInputFontSize();

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
      // Stripe scales the whole Element off this. Left at Stripe's 16px default
      // it rendered field values ~2px larger than the site's own inputs on
      // desktop; `.Label` below is pinned separately so pulling the base down
      // does not drag the labels under the site's 14px labels with it.
      fontSizeBase,
      colorTextPlaceholder: "#76766B",
    },
    rules: {
      // Do not crush `.AccordionItem` padding. Payment Element accordion
      // radios (`layout.radios: "always"`) sit in that padding; 4px hid them.
      ".Tab": {
        border: `1px solid ${primary}`,
        borderRadius: radius,
        boxShadow: "none",
      },
      ".Tab:hover": {
        color: primary,
      },
      ".Tab--selected": {
        border: `2px solid ${primary}`,
        boxShadow: "none",
      },
      ".TabIcon": {
        fill: primary,
      },
      ".TabIcon--selected": {
        fill: primary,
      },
      ".Label": {
        fontSize: SITE_TYPE.labelFontSize,
        fontWeight: SITE_TYPE.labelFontWeight,
      },
      ".Input": {
        padding: "11px 10px",
        outline: `1px solid ${primary}`,
        borderRadius: radius,
        fontSize: fontSizeBase,
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

/**
 * The size the site's own `<Input>` is rendering at right now.
 *
 * `components/ui/input.tsx` is `text-base md:text-sm`, i.e. 16px on a phone and
 * 14px from Tailwind's `md` up. Stripe's appearance takes ONE size, so the
 * breakpoint is read directly rather than guessed. 16px on mobile is not an
 * arbitrary pick either — anything under it makes iOS Safari zoom on focus.
 *
 * Read once, when the appearance is built: the caller memoises the appearance
 * for the life of the checkout session, so a window dragged across 768px
 * mid-checkout re-sizes the site's own fields but leaves Stripe's at the size
 * they mounted with. That is a far smaller discrepancy than the one this
 * closes, and Stripe offers no media-query hook in `rules` to do better.
 */
function readInputFontSize(): string {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return SITE_TYPE.inputFontSizeDesktop;
  }
  return window.matchMedia(SITE_TYPE.desktopQuery).matches
    ? SITE_TYPE.inputFontSizeDesktop
    : SITE_TYPE.inputFontSizeMobile;
}
