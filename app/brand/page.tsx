import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { BrandPage } from "@/components/headkit-ui/brand/brand-page";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";

export const metadata: Metadata = {
  title: "Brands",
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/brand`,
  },
};

async function getBrands() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:brands");
  return sdk.brands.list();
}

export default async function Page() {
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
