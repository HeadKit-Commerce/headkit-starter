import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { BrandPage } from "@/components/headkit-ui/brand/brand-page";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Brands",
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/brand`,
  },
};

async function getBrands() {
  "use cache";
  // Brands change rarely; webhooks invalidate `headkit:brands`.
  cacheLife("weeks");
  cacheTag("headkit:brands");
  return sdk.brands.list();
}

async function BrandsRoute() {
  const result = await getBrands();

  return (
    <>
      <BrandHeader
        name="Brands"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Brands", uri: "/brand", current: true },
        ]}
      />
      <BrandPage brands={result.brands} />
    </>
  );
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 px-5 py-10 md:px-10">
          <Skeleton animated={false} className="h-4 w-32" />
          <Skeleton animated={false} className="h-10 w-40" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton
                key={i}
                animated={false}
                className="aspect-[4/3] w-full rounded-brand"
              />
            ))}
          </div>
        </div>
      }
    >
      <BrandsRoute />
    </Suspense>
  );
}
