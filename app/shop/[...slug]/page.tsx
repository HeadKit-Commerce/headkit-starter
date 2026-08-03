import type { ReactNode } from "react";
import { Suspense } from "react";
import { permanentRedirect } from "next/navigation";

/** Satisfies Cache Components: `generateStaticParams` must not return []. */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
};

/**
 * Legacy shop PDP → canonical `/products/[...slug]` (ENG-853).
 *
 * Keeps one RSC tree, one `getCachedProduct` entry, and ProductStock Suspense.
 * Color / variant query params are preserved for clients that still deep-link
 * via `/shop/{slug}?pa_color=…`.
 *
 * `generateStaticParams` + Suspense around `searchParams` are required after
 * ENG-859 removed segment `loading.tsx`: Cache Components treats catch-all
 * `params` / `searchParams` as uncached outside a boundary and fails the build
 * with blocking-route.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

async function RedirectWithSearch({
  productSlug,
  searchParams,
}: {
  productSlug: string;
  searchParams: Promise<Record<string, string>>;
}): Promise<ReactNode> {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  permanentRedirect(
    qs ? `/products/${productSlug}?${qs}` : `/products/${productSlug}`,
  );
}

export default async function Page({
  params,
  searchParams,
}: Props): Promise<ReactNode> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) {
    permanentRedirect("/shop");
  }
  const productSlug = slug[slug.length - 1];
  if (!productSlug) {
    permanentRedirect("/shop");
  }

  return (
    <Suspense fallback={null}>
      <RedirectWithSearch
        productSlug={productSlug}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
