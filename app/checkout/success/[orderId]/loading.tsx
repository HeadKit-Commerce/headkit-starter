import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutSuccessLoading() {
  return (
    <div className="px-5 md:px-10 mt-5 space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-5 w-32" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
