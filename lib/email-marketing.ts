/**
 * Cached email marketing (Klaviyo / HubSpot) status for layout / chrome.
 *
 * Must use Cache Components (`"use cache"`) so the root layout read does not
 * poison static prerender (blocking-route on `/_not-found` and every page).
 * Secrets are never returned — only public connection status.
 */

import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { createServerHeadkit } from "@/lib/sdk.server";

export type EmailMarketingStatusResult = {
  enabled: boolean;
  provider: string;
  publicApiKey: string | null;
  listConfigured: boolean;
};

const DISABLED_STATUS: EmailMarketingStatusResult = {
  enabled: false,
  provider: "",
  publicApiKey: null,
  listConfigured: false,
};

/**
 * Public email marketing status for the current store.
 * Safe for root layout — cached + tagged for revalidation.
 */
export async function getEmailMarketingStatus(): Promise<EmailMarketingStatusResult> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(TAG.emailMarketing, TAG.settings);

  try {
    const status = await createServerHeadkit().emailMarketing.status();
    return {
      enabled: Boolean(status?.enabled),
      provider: status?.provider ?? "",
      publicApiKey: status?.publicApiKey ?? null,
      listConfigured: Boolean(status?.listConfigured),
    };
  } catch {
    return DISABLED_STATUS;
  }
}
