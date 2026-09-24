import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getCachedProduct } from "@/lib/product-cache";
import { productPath, type CanonicalProductRef } from "@/lib/canonical-path";

/**
 * The flat PDP's canonical decision, in ONE place so the route and `proxy.ts`
 * cannot disagree about it.
 *
 * Split in two on purpose. {@link productRedirectTarget} is the RULE and takes
 * a product the caller has already read — `app/products/[...slug]/page.tsx`
 * needs that product to render, so re-reading it there would be a second read
 * for one string. {@link canonicalProductRedirect} is the rule plus the read,
 * for `/api/canonical-redirect`, which has no product in hand and wants
 * nothing else from it.
 */

/**
 * Cache Components requires `generateStaticParams` to return >= 1 param. When
 * the catalog API is unreachable at build, `app/products/[...slug]` emits this
 * single placeholder (which `generateMetadata` and the page resolve to
 * noindex / notFound) instead of throwing — a transient backend error must not
 * fail the whole tenant deploy. Never a real product slug.
 *
 * Exported from here rather than the route file because every caller of the
 * canonical rule has to recognise it, `/api/canonical-redirect` included: a
 * redirect issued for the placeholder would be a redirect to nothing.
 */
export const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

/**
 * The path a `/products/...` URL must 308 to, or null when it is already
 * canonical.
 *
 * `slug` is the catch-all as the route receives it: `[productSlug]` or
 * `[productSlug, colourSlug]`.
 */
export function productRedirectTarget(
  product: CanonicalProductRef,
  slug: string[],
): string | null {
  const canonical = productPath(product, slug[1]);
  const requested = `/products/${slug.join("/")}`;
  return canonical === requested ? null : canonical;
}

/**
 * {@link productRedirectTarget} plus the public catalogue read it needs.
 *
 * Null for the build-time placeholder, an empty slug, and — critically — a
 * product the PUBLIC read cannot see. That last case is the position a Shopify
 * draft occupies, and not redirecting it is what lets `?preview_key=` reach the
 * render that consults the Admin API (see the Shopify preview section in
 * `AGENTS.md`). A THROWN read degrades to null as well: the redirect is a
 * consolidation, so losing it costs one duplicate URL, while turning a
 * transport blip into a redirect would be worse.
 *
 * `getCachedProduct` is the same `"use cache"` entry the PDP route awaits
 * (`cacheLife("max")`, purged by `headkit:product:{slug}`), so calling it here
 * adds NO origin read the request was not already going to pay: on a flat URL
 * that redirects, the route never runs; on one that does not, the route's own
 * call is a hit on the entry this just warmed.
 */
export async function canonicalProductRedirect(
  slug: string[],
): Promise<string | null> {
  const productSlug = slug[0];
  if (!productSlug || productSlug === STATIC_GEN_PLACEHOLDER_SLUG) return null;

  try {
    const product = await getCachedProduct(productSlug);
    if (!product) return null;
    return productRedirectTarget(product, slug);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}
