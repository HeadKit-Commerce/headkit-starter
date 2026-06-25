import { Skeleton } from "@/components/ui/skeleton";

export default function CollectionLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Collection header — px-4 md:px-10, grid matching CollectionHeader */}
      <div className="overflow-x-hidden">
        <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
          <div className="pt-5">
            <Skeleton className="mb-5 h-4 w-64" />
            <Skeleton className="mb-[10px] h-9 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex justify-center md:justify-end md:pt-5">
            <Skeleton className="h-24 w-full max-w-xs rounded-lg md:h-32 md:w-64" />
          </div>
        </div>
      </div>

      {/* Filter bar — px-5 md:px-10 py-5, left chips + right sort */}
      <div className="flex w-full items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Product grid — px-5 md:px-10, grid-cols-1 md:grid-cols-3 */}
      <div className="px-5 md:px-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>

      {/* LoadMore + ProductCount area */}
      <div className="flex flex-col items-center gap-5 pb-10">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
