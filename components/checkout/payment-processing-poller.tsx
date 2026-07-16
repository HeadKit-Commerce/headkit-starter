"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCheckoutSessionAction } from "@/app/checkout/actions";

const POLL_INTERVAL_MS = 2_500;
const POLL_TIMEOUT_MS = 60_000;

/**
 * Client poller mounted by <PaymentProcessing> while a session is pending
 * (async BNPL settling, or manual capture in flight — ENG-784, D4).
 *
 * Polls the Stripe session every 2.5s for up to 60s and routes on the first
 * terminal state:
 *  - paid + REAL orderId/orderKey → order confirmation page
 *  - paymentIntentStatus "canceled" (mechanism 2 canceled a mismatched
 *    authorization) → /checkout/error?reason=payment_canceled
 *  - session expired → /checkout/error?reason=session_expired
 *  - timeout → stop polling; the static reassurance copy stays on screen and
 *    the webhook/email confirms asynchronously.
 *
 * D4: the webhook is the SOLE capture authority — this component only READS
 * session state and routes. It never captures, confirms, or processes.
 */
export function PaymentProcessingPoller({
  sessionId,
}: {
  sessionId: string;
}): null {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const startedAt = Date.now();

    const intervalId = setInterval(() => {
      if (cancelled || inFlight) return;
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        clearInterval(intervalId);
        return;
      }
      inFlight = true;
      getCheckoutSessionAction(sessionId)
        .then((session) => {
          if (cancelled) return;
          if (
            session.paymentStatus === "paid" &&
            session.orderId &&
            session.orderId !== "0" &&
            session.orderKey
          ) {
            router.replace(
              `/checkout/success/${encodeURIComponent(session.orderId)}?key=${encodeURIComponent(session.orderKey)}&session_id=${encodeURIComponent(sessionId)}`,
            );
            return;
          }
          if (session.paymentIntentStatus === "canceled") {
            router.replace("/checkout/error?reason=payment_canceled");
            return;
          }
          if (session.status === "expired") {
            router.replace("/checkout/error?reason=session_expired");
          }
        })
        .catch(() => {
          /* transient — keep polling */
        })
        .finally(() => {
          inFlight = false;
        });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [sessionId, router]);

  return null;
}
