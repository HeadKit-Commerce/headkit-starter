import { Skeleton } from "@/components/ui/skeleton";
import type { BrandSummaryFieldsFragment } from "@headkit/sdk";
import { BrandCard } from "./brand-card";

interface BrandGridProps {
  brands: BrandSummaryFieldsFragment[];
  loading?: boolean;
}

function BrandGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:grid-cols-3 md:px-10 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-32 w-full rounded-brand" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function BrandGrid({ brands, loading }: BrandGridProps) {
  if (loading) return <BrandGridSkeleton />;

  if (!brands.length) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-lg text-gray-500">No brands found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 px-5 md:px-10">
      {brands.map((brand) => (
        <BrandCard key={brand.id} brand={brand} />
      ))}
    </div>
  );
}
