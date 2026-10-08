import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { cacheLifeForProfile } from "@/lib/cache-profile";
import { headkit as sdk } from "@/lib/sdk";
import { BrandPage } from "@/components/headkit-ui/brand/brand-page";
import { BrandHeader } from "@/components/headkit-ui/brand/brand-header";
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
  cacheLifeForProfile("weeks", "max");
  cacheTag("headkit:brands");
  return sdk.brands.list();
}



/**
 * The brand list is a cached read (`getBrands`), so the header and the grid
 * are the static shell. Nothing on this route awaits `searchParams`.
 *
 * @see https://nextjs.org/docs/app/getting-started/caching
 */
export const instant = true;
// The finished document is prerendered. This fails the build if the
// route, or a layout above it, starts reading cookies, headers,
// searchParams, or connection(). The root layout stays unset.
export const ensureStatic = "navigation";

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
