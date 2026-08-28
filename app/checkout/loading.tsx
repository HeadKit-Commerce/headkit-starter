import { CheckoutFormSkeleton } from "@/components/checkout/checkout-form-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback while checkout RSC resolves. Skeleton only — no copy.
 * Shopify carts still redirect to hosted checkout once SSR finishes; they see
 * this briefly, not a Stripe accordion.
 */
export default function CheckoutLoading(): React.ReactElement {
  return (
    <div className="bg-brand-bg">
      <div className="px-[20px] md:px-[40px] mx-auto grid grid-cols-12 gap-[20px] py-8">
        <div className="order-2 md:order-1 col-span-12 md:col-span-6">
          <CheckoutFormSkeleton />
        </div>
        <div className="order-1 md:order-2 col-span-12 md:col-start-7 md:col-span-6 lg:col-start-8 lg:col-span-5 space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
