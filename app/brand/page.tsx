import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { BrandPage } from "@/components/headkit-ui/brand/brand-page";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getBranding } from "@/lib/branding";
import { storefrontUrl } from "@/lib/make-metadata";

/**
 * Canonical origin comes from the RUNTIME store domain, not the build-time
 * `NEXT_PUBLIC_FRONTEND_URL` — a custom domain attached without a redeploy
 * leaves that env naming the old `*.headkit.app` host, which would put a
 * cross-host canonical on a route `app/sitemap.ts` advertises under the
 * customer's apex (it emits every `<loc>` from `resolveSiteUrl(store.domain)`).
 *
 * `getBranding()` is `"use cache: remote"`, so reading it here costs this route
 * no static rendering: the metadata read stays cacheable exactly as the sibling
 * `app/shop/page.tsx` already does.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { storeSettings } = await getBranding();
    return {
      title: "Brands",
      alternates: {
        canonical: storefrontUrl("/brand", storeSettings.domain),
      },
    };
  } catch {
    return {
      title: "Brands",
      alternates: { canonical: storefrontUrl("/brand") },
    };
  }
}

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
