import { Skeleton } from "@/components/ui/skeleton";

export default function BrandLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* BrandHeader layout — px-4 md:px-10, grid */}
      <div className="overflow-x-hidden">
        <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
          <div className="pt-5">
            <Skeleton className="mb-5 h-4 w-64" />
            <Skeleton className="mb-3 h-20 w-40" />
            <Skeleton className="mb-[10px] h-9 w-48" />
            <Skeleton className="h-5 w-80" />
          </div>
        </div>
      </div>

      {/* Brand grid — same as BrandGrid: grid-cols-1 sm:2 md:3 lg:4, gap-6, px-5 md:px-10 */}
      <div className="grid grid-cols-1 gap-6 px-5 md:px-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
