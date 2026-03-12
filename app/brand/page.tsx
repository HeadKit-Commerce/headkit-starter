import type { Metadata } from "next";
import { headkit as sdk } from "@/lib/sdk";
import { BrandPage } from "@/components/headkit-ui/brand/brand-page";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";

export const metadata: Metadata = {
  title: "Brands",
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/brand`,
  },
};

export default async function Page() {
  const result = await sdk.brands.list();

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
