import { Skeleton } from "@/components/ui/skeleton";

function QuoteItemSkeleton() {
  return (
    <div className="flex gap-4 md:gap-5">
      <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-[3px] md:h-[140px] md:w-[140px]" />
      <div className="flex flex-1 flex-col justify-between space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}

export default function QuoteLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="px-5 py-10 md:px-10 md:py-16">
        <div className="mb-10 max-w-2xl space-y-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-2/3 max-w-md" />
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
          <aside className="space-y-5 md:order-1">
            <Skeleton className="h-6 w-28" />
            <QuoteItemSkeleton />
            <QuoteItemSkeleton />
          </aside>

          <section className="md:order-2">
            <Skeleton className="mb-4 h-6 w-32" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="mt-2 h-11 w-full" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
