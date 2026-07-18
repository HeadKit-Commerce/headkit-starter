import { Skeleton } from "@/components/ui/skeleton";

function AccordionBlockSkeleton() {
  return (
    <div className="mb-2 rounded-md border border-gray-200 bg-white px-5 py-5 md:px-10 md:py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="min-h-[700px] py-10">
        <div className="mx-auto grid grid-cols-12 gap-[20px] px-[20px] md:px-[40px]">
          <div className="order-2 md:order-1 col-span-12 space-y-2 md:col-span-6">
            <AccordionBlockSkeleton />
            <AccordionBlockSkeleton />
            <AccordionBlockSkeleton />
            <AccordionBlockSkeleton />
          </div>
          <div className="order-1 md:order-2 col-span-12 md:col-span-6 md:col-start-7 lg:col-span-5 lg:col-start-8">
            <div className="border-y border-[#d6d6d6] px-5 py-[17px] md:border-0 md:py-0">
              <div className="flex justify-between md:hidden">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="mt-5 space-y-5 md:mt-0">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-20 w-20 shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
                <div className="mt-8">
                  <Skeleton className="mb-5 h-10 w-full rounded-md" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                  <div className="mt-5 flex justify-between">
                    <Skeleton className="h-6 w-14" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
