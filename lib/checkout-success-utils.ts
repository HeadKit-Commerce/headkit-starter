/**
 * Utilities for checkout success page logic.
 * Extracted for testability.
 */

const PENDING_STATUSES = ["pending", "pending_payment", "checkout-draft"];

/**
 * Returns true when processCheckoutOrder should run (first visit, order still pending).
 * Returns false on revisit (order already processing/completed) or when session data is incomplete.
 */
export function needsCheckoutOrderProcessing(
  orderStatus: string,
  sessionCartToken: string | null | undefined,
  sessionOrderId: string | null | undefined,
  sessionOrderKey: string | null | undefined,
): boolean {
  const isPendingPayment = PENDING_STATUSES.includes(orderStatus.toLowerCase());
  return (
    !!sessionCartToken &&
    !!sessionOrderId &&
    !!sessionOrderKey &&
    isPendingPayment
  );
}
