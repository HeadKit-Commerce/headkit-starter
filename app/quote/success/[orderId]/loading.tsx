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
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

export default function QuoteSuccessLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="px-5 pb-10 pt-10 md:px-10 md:pt-16">
        <div className="mb-10 max-w-2xl space-y-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-2/3 max-w-md" />
          <Skeleton className="mt-2 h-7 w-36" />
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
          <aside className="space-y-5 md:order-1">
            <Skeleton className="h-6 w-28" />
            <QuoteItemSkeleton />
            <QuoteItemSkeleton />
          </aside>

          <section className="md:order-2">
            <Skeleton className="mb-4 h-6 w-36" />
            <div className="space-y-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-2 md:grid-cols-3 md:gap-4"
                >
                  <Skeleton className="col-span-1 h-5 w-20" />
                  <Skeleton className="col-span-3 h-5 w-48 md:col-span-2" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-10 h-11 w-full md:w-48" />
          </section>
        </div>
      </div>
    </div>
  );
}
