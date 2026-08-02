"use server";

/**
 * Email marketing server actions — subscribe + status via commerce GraphQL.
 * No-ops safely when the store has no Klaviyo connection.
 *
 * Layout / RSC chrome must use {@link getEmailMarketingStatus} (cached), not
 * these actions, so Cache Components prerender stays unblocked.
 */

import { createServerHeadkit } from "@/lib/sdk.server";
import {
  getEmailMarketingStatus,
  type EmailMarketingStatusResult,
} from "@/lib/email-marketing";

export type { EmailMarketingStatusResult };

export type SubscribeEmailSource = "footer" | "checkout" | "form" | "other";

export type SubscribeEmailActionResult = {
  success: boolean;
  error?: string;
};

/** Public status for client components (checkout, etc.). */
export async function getEmailMarketingStatusAction(): Promise<EmailMarketingStatusResult> {
  return getEmailMarketingStatus();
}

/**
 * Subscribe an email when marketing is enabled.
 * Returns success=false (no throw) when disabled or on soft failures so UI can no-op.
 */
export async function subscribeEmailAction(input: {
  email: string;
  source: SubscribeEmailSource;
  firstName?: string;
  lastName?: string;
}): Promise<SubscribeEmailActionResult> {
  const email = input.email.trim();
  if (!email) {
    return { success: false, error: "Email is required" };
  }

  try {
    const result = await createServerHeadkit().emailMarketing.subscribe({
      email,
      source: input.source,
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
    });

    if (result.userErrors?.length) {
      return {
        success: false,
        error: result.userErrors[0]?.message ?? "Subscribe failed",
      };
    }

    return { success: Boolean(result.success) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Subscribe failed",
    };
  }
}
