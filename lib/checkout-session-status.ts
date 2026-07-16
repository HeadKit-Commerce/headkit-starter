"use server";

import { createServerHeadkit } from "@/lib/sdk.server";

/**
 * Dead-session detection (ENG-784, D7): a Stripe Checkout Session is "dead"
 * when a SERVER-SIDE retrieve reports any status other than "open" — never
 * inferred by sniffing Stripe error strings client-side. Called from the
 * checkout confirm-time error paths (card step, express wallet) to decide
 * whether a failed confirm means "session was expired under us → auto-recreate
 * once" versus an ordinary payment error that keeps inline handling.
 */
export async function isCheckoutSessionDead(
  sessionId: string,
): Promise<boolean> {
  try {
    const session =
      await createServerHeadkit().payments.getCheckoutSession(sessionId);
    return session.status !== "open";
  } catch {
    // Retrieve failed (transient/network) — we cannot PROVE the session is
    // dead, so report alive and let the caller keep its inline error handling
    // rather than tearing down a possibly-payable session.
    return false;
  }
}
