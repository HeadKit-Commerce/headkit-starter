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

/**
 * DO NOT re-export a type from this file.
 *
 * A `"use server"` module is rewritten by Next's server-actions loader into a
 * list of RUNTIME re-exports — `export {X as '<action-id>'} from 'ACTIONS_MODULE'`
 * — and under Turbopack that rewrite does not distinguish a type-only export
 * from a value one. `export type { EmailMarketingStatusResult };` therefore
 * compiled to a runtime binding for a name that only ever existed in the type
 * system, and the module threw on evaluation:
 *
 *   ReferenceError: EmailMarketingStatusResult is not defined
 *     at .next-internal/server/app/products/[...slug]/page/actions.js
 *
 * That is a 500 on every route whose action graph includes this file — which is
 * every PDP — and it is INVISIBLE to `tsc --noEmit`, because at the type level
 * the re-export is perfectly legal. It was introduced with the Klaviyo
 * integration (81a140fc, PR #103) and had no consumer: nothing imports
 * `EmailMarketingStatusResult` from this module. Import it from
 * `@/lib/email-marketing`, which is a plain module and can export types freely.
 *
 * Found while running the add-on suite for plan 15.2a-03: 8 of its 17 cases were
 * failing on a 500 PDP before this line was removed, and all 8 pass after.
 */

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
