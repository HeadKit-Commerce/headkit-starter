import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="animate-in fade-in duration-300 overflow-hidden">
      {/* Hero skeleton — matches MainCarousel heights */}
      <div className="mx-5">
        <Skeleton className="h-[40vh] w-full rounded-2xl md:h-[60vh] lg:h-[80vh]" />
      </div>

      {/* Featured-style section: title + carousel row */}
      <div className="px-5 py-5 md:px-10">
        <div className="grid w-full grid-cols-1 gap-x-8 gap-y-2 py-5 md:grid-cols-3">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="mt-5 flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-64 min-w-[200px] flex-1 rounded-lg md:min-w-[240px]"
            />
          ))}
        </div>
      </div>

      {/* New Arrivals-style section: title + grid */}
      <div className="px-5 py-10 md:px-10">
        <div className="grid w-full grid-cols-1 gap-x-8 gap-y-2 py-5 md:grid-cols-3">
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>

      {/* Newsletter strip */}
      <section className="bg-purple-800 py-16">
        <div className="mx-auto max-w-xl px-5">
          <Skeleton className="mb-3 h-9 w-48 bg-purple-700" />
          <Skeleton className="mb-6 h-5 w-full max-w-md bg-purple-700" />
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1 rounded-md bg-purple-700" />
            <Skeleton className="h-12 w-28 rounded-md bg-purple-700" />
          </div>
        </div>
      </section>
    </div>
  );
}
