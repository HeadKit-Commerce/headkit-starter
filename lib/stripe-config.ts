/**
 * Per-store Stripe configuration for the storefront, read from dashboard-api.
 *
 * Mirrors the resilience contract in `branding.ts`: dashboard-api revisions lag
 * the starter, and gqlgen answers a query containing an UNKNOWN field with
 * `data: null` — discarding the fields it does know. So the newer fields are
 * requested first and the query is retried without them on failure, rather than
 * losing the publishable key entirely on an older backend.
 */

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { env } from "@/lib/env";

const FULL_QUERY = /* GraphQL */ `
  query StorefrontStripeConfig {
    stripeConfig {
      publishableKeyTest
      publishableKeyLive
      accountId
      mode
      bnplMessagingEnabled
    }
  }
`;

/** Compat query for dashboard-api revisions predating mode / bnplMessagingEnabled. */
const COMPAT_QUERY = /* GraphQL */ `
  query StorefrontStripeConfigCompat {
    stripeConfig {
      publishableKeyTest
      publishableKeyLive
      accountId
    }
  }
`;

interface RawStripeConfig {
  publishableKeyTest?: string | null;
  publishableKeyLive?: string | null;
  accountId?: string | null;
  mode?: string | null;
  bnplMessagingEnabled?: boolean | null;
}

export interface StorefrontStripeConfig {
  /** The key for the store's active mode. Empty string when unavailable. */
  publishableKey: string;
  /** Connect account id. Empty string in platform/direct mode. */
  accountId: string;
  /** False unless the store explicitly opted in. */
  bnplMessagingEnabled: boolean;
}

export const DISABLED_STRIPE_CONFIG: StorefrontStripeConfig = {
  publishableKey: "",
  accountId: "",
  bnplMessagingEnabled: false,
};

/**
 * Pure coercion. `mode` absent means an older dashboard-api, which is treated as
 * TEST: sending live traffic to a live key we are not certain about is the worse
 * failure, and the badge is decorative.
 */
export function coerceStripeConfig(
  raw: RawStripeConfig | null | undefined,
): StorefrontStripeConfig {
  if (!raw) return DISABLED_STRIPE_CONFIG;

  const test = raw.publishableKeyTest ?? "";
  const live = raw.publishableKeyLive ?? "";
  const isLive = (raw.mode ?? "TEST").toUpperCase() === "LIVE";

  return {
    publishableKey: isLive ? live || test : test,
    accountId: raw.accountId ?? "",
    bnplMessagingEnabled: raw.bnplMessagingEnabled === true,
  };
}

async function post(
  endpoint: string,
  token: string,
  query: string,
): Promise<RawStripeConfig | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { stripeConfig?: RawStripeConfig | null } | null;
    };
    return json.data?.stripeConfig ?? null;
  } catch {
    return null;
  }
}

/**
 * Cached per-store Stripe config. `cacheLife("hours")` because a publishable key
 * and a connect account id change only when a merchant reconnects Stripe, and
 * the toggle is not latency-sensitive. `'use cache: remote'` (not plain `'use
 * cache'`) so the read is durable across Vercel Fluid Compute invocations
 * instead of re-evaluating per request. Tagged `TAG.settings` so a dashboard
 * BNPL-toggle change can invalidate it via `/api/revalidate`.
 */
export async function getStripeConfig(): Promise<StorefrontStripeConfig> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.settings);

  const endpoint = env.DASHBOARD_API_URL;
  const token = env.DASHBOARD_API_TOKEN;
  if (!endpoint || !token) return DISABLED_STRIPE_CONFIG;

  const full = await post(endpoint, token, FULL_QUERY);
  if (full) return coerceStripeConfig(full);

  const compat = await post(endpoint, token, COMPAT_QUERY);
  return coerceStripeConfig(compat);
}
