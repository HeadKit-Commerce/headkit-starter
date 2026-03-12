import type { BrandSummaryFieldsFragment } from "@headkit/sdk";
import { BrandGrid } from "./brand-grid";

interface BrandPageProps {
  brands: BrandSummaryFieldsFragment[];
}

export function BrandPage({ brands }: BrandPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <BrandGrid brands={brands} />
    </div>
  );
}
