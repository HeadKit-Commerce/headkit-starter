import { Skeleton } from "@/components/ui/skeleton";

export default function BrandLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* BrandHeader layout — px-4 md:px-10, grid */}
      <div className="overflow-x-hidden">
        <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
          <div className="pt-5">
            <Skeleton className="mb-5 h-4 w-48 max-w-full sm:w-64" />
            <Skeleton className="mb-3 h-20 w-40 rounded-brand" />
            <Skeleton className="mb-[10px] h-9 w-40 max-w-full sm:w-48" />
            <Skeleton className="h-5 w-full max-w-sm" />
          </div>
        </div>
      </div>

      {/* Brand grid — same as BrandGrid */}
      <div className="grid grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:grid-cols-3 md:px-10 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-32 w-full rounded-brand" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
