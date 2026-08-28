import { Skeleton } from "@/components/ui/skeleton";

function StepSkeleton({ lines = 2 }: { lines?: number }): React.ReactElement {
  return (
    <div className="space-y-3 border-b border-[#d6d6d6] py-5">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 ? "h-10 w-full" : "h-4 w-3/4"}
        />
      ))}
    </div>
  );
}

/**
 * Layout-stable placeholder for Stripe.js / CheckoutProvider init.
 * Matches the left-column accordion rhythm — no copy, same pattern as the
 * rest of the storefront.
 */
export function CheckoutFormSkeleton(): React.ReactElement {
  return (
    <div
      data-testid="checkout-form-skeleton"
      className="space-y-0"
      aria-hidden="true"
    >
      <Skeleton className="mb-4 h-12 w-full" />
      <StepSkeleton lines={3} />
      <StepSkeleton lines={1} />
      <StepSkeleton lines={2} />
      <StepSkeleton lines={2} />
    </div>
  );
}
