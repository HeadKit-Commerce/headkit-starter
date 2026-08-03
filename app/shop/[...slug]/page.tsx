import type { ReactNode } from "react";
import { Suspense } from "react";
import { permanentRedirect } from "next/navigation";

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
};

/**
 * Legacy shop PDP → canonical `/products/[...slug]` (ENG-853).
 *
 * Cache Components (next-cache-components skill / blocking-route docs):
 * await `params` + `searchParams` only inside a Suspense child — never in the
 * route segment shell — after ENG-859 removed `loading.tsx`.
 * `generateStaticParams` still supplies ≥1 param for build validation.
 *
 * `return null` after `permanentRedirect` is required: without a value return,
 * TypeScript infers `Promise<void>`, which is not a valid JSX component type.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

async function ShopProductRedirect({
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

  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  permanentRedirect(
    qs ? `/products/${productSlug}?${qs}` : `/products/${productSlug}`,
  );
  return null;
}

/** Sync shell — passes promises into Suspense (blocking-route recommended fix). */
export default function Page(props: Props): ReactNode {
  return (
    <Suspense fallback={null}>
      <ShopProductRedirect {...props} />
    </Suspense>
  );
}
