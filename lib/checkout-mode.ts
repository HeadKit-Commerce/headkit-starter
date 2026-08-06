/**
 * Storefront checkout mode derived from dashboard StoreSettings.checkoutType.
 */

export type CheckoutMode = "custom" | "quote";

export const DEFAULT_CHECKOUT_MODE: CheckoutMode = "custom";

/**
 * Normalize GraphQL / API checkout type values to a storefront mode.
 */
export function normalizeCheckoutMode(
  value: string | null | undefined,
): CheckoutMode {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "quote") {
    return "quote";
  }
  return "custom";
}

/**
 * True when the storefront should hide prices and use quote copy.
 */
export function isQuoteMode(mode: CheckoutMode): boolean {
  return mode === "quote";
}
