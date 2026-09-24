import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * PayPal credentials, resolved once from the validated env.
 *
 * PayPal is a per-STORE capability, not a platform one: it is offered only
 * when this store's deployment carries BOTH
 * `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. With either
 * absent the storefront behaves exactly as if PayPal did not exist — the
 * Payment step renders what it renders today, byte for byte
 * (`app/checkout/paypal-absent.test.tsx`), the four `/api/paypal/*` routes
 * answer 503 without reaching PayPal, and this module says so ONCE at info
 * level so a rehearsal build without the secrets is quiet.
 *
 * The pattern is the starter's usual one for a per-store integration: the
 * SERVER reduces the credentials to the smallest thing the client needs.
 * Here that is not a bare boolean —
 * PayPal's JS SDK has to be loaded in the browser with the public client id —
 * so {@link getPayPalClientOptions} hands out the client id and the
 * live/sandbox flag and NOTHING else. `PAYPAL_CLIENT_SECRET` and
 * `PAYPAL_WEBHOOK_ID` never leave this process.
 *
 * `NEXT_PUBLIC_PAYPAL_LIVE_MODE` defaults to `false` (sandbox) when unset, so
 * a half-configured store cannot take real money by accident.
 */

/** The full server-side credential set. Never serialize this. */
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  /** True when `NEXT_PUBLIC_PAYPAL_LIVE_MODE` is exactly "true". */
  isLive: boolean;
  /** REST API origin for this mode — the same hosts dashboard-api uses. */
  apiBase: string;
}

/**
 * The public half: everything the browser needs to load PayPal's JS SDK, and
 * nothing else. Safe to pass through an RSC boundary as a prop.
 */
export interface PayPalClientOptions {
  clientId: string;
  /** PayPal's own word for the mode, as its JS SDK and dashboard use it. */
  environment: "live" | "sandbox";
}

export const PAYPAL_LIVE_API_BASE = "https://api-m.paypal.com";
export const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";

let loggedAbsent = false;

export function getPayPalConfig(): PayPalConfig | null {
  const clientId = env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (!loggedAbsent) {
      loggedAbsent = true;
      logger.info("paypal_disabled", {
        reason: "env_absent",
        // Names only — never a value.
        missing: [
          clientId ? null : "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
          clientSecret ? null : "PAYPAL_CLIENT_SECRET",
        ].filter((name): name is string => name !== null),
      });
    }
    return null;
  }
  const isLive = env.NEXT_PUBLIC_PAYPAL_LIVE_MODE === "true";
  return {
    clientId,
    clientSecret,
    isLive,
    apiBase: isLive ? PAYPAL_LIVE_API_BASE : PAYPAL_SANDBOX_API_BASE,
  };
}

/** Whether this store can offer PayPal at all. */
export function isPayPalConfigured(): boolean {
  return getPayPalConfig() !== null;
}

/** The public options the checkout passes to the browser, or null when off. */
export function getPayPalClientOptions(): PayPalClientOptions | null {
  const config = getPayPalConfig();
  if (!config) return null;
  return {
    clientId: config.clientId,
    environment: config.isLive ? "live" : "sandbox",
  };
}

/**
 * The value `payment_mode` carries into WooCommerce order meta, matching the
 * theme's existing `_headkit_payment_mode` vocabulary (`live` / `test`) rather
 * than PayPal's own (`live` / `sandbox`).
 */
export function payPalPaymentMode(config: PayPalConfig): "live" | "test" {
  return config.isLive ? "live" : "test";
}

/**
 * The webhook id this store's PayPal REST app was configured with.
 *
 * Returned as `null` when unset, and the webhook route FAILS CLOSED on that —
 * every event must be verified against a webhook id, and an unset id means we
 * cannot verify. Never 200 with side effects on an unverified event.
 */
export function getPayPalWebhookId(): string | null {
  return env.PAYPAL_WEBHOOK_ID ?? null;
}
