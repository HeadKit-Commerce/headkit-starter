import { permanentRedirect } from "next/navigation";

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
 */
export default async function ShopProductRedirect({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const productSlug = slug[slug.length - 1];
  if (!productSlug) {
    permanentRedirect("/shop");
  }

  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  permanentRedirect(
    qs ? `/products/${productSlug}?${qs}` : `/products/${productSlug}`,
  );
}
