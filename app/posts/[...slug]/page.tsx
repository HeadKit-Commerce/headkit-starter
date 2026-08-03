import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

type Props = {
  params: Promise<{ slug: string[] }>;
};

/**
 * /posts/[...slug] → /news/[...slug] permanent redirect.
 *
 * headkit-demo used /posts as the blog URL pattern.
 * apps/starter uses /news. This redirect preserves inbound links and
 * search-engine indexed post URLs after the migration cutover.
 *
 * Cache Components: await `params` inside Suspense (blocking-route docs),
 * even though this segment still has `loading.tsx` — keeps the redirect
 * valid if that loading boundary is later removed (ENG-859 pattern).
 *
 * `return null` after `redirect` is required: without a value return,
 * TypeScript infers `Promise<void>`, which is not a valid JSX component type.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

async function PostsRedirect({ params }: Props): Promise<ReactNode> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) {
    redirect("/news");
  }
  redirect(`/news/${slug.join("/")}`);
  return null;
}

export default function Page(props: Props): ReactNode {
  return (
    <Suspense fallback={null}>
      <PostsRedirect {...props} />
    </Suspense>
  );
}
