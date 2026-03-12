import { Skeleton } from "@/components/ui/skeleton";

export default function CmsPageLoading() {
  return (
    <div className="animate-in fade-in duration-300 px-5 py-10 md:px-10 min-h-[50vh]">
      <Skeleton className="mb-5 h-9 w-64" />
      <div className="mt-5 grid grid-cols-12">
        <div className="col-span-12 space-y-3 md:col-span-9">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
