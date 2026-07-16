import Link from "next/link";
import { PaymentProcessingPoller } from "@/components/checkout/payment-processing-poller";

/**
 * Server-rendered pending/processing screen for async payment methods (session
 * complete but payment_status unpaid) and for the paid-but-unresolved-order
 * fallback — a paying customer must never be silently bounced to the homepage.
 * Used by both checkout return pages (/checkout/success and
 * /checkout/success/[orderId], ENG-789).
 *
 * ENG-784: when `sessionId` is provided, a client poller upgrades this static
 * screen — it polls the session every 2.5s (≤60s) and auto-routes to the order
 * confirmation once paid, or to the error page on cancel/expiry. The poller
 * only reads/routes; the webhook remains the sole capture authority (D4).
 */
export function PaymentProcessing({
  sessionId,
}: {
  sessionId?: string;
} = {}): React.ReactElement {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      {sessionId && <PaymentProcessingPoller sessionId={sessionId} />}
      <div className="bg-white rounded-lg shadow-lg p-8 text-center space-y-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-16 h-16 mx-auto text-blue-500"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <h1 className="text-2xl font-bold text-gray-900">
          Your payment is processing
        </h1>
        <p className="text-gray-600">
          Thanks for your order! Your payment is still being processed by your
          payment provider. We&apos;ll confirm your order by email as soon as
          the payment completes — no further action is needed.
        </p>

        <Link href="/" className="inline-block text-blue-600 underline text-sm">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
