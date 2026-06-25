import { redirect } from "next/navigation";

/**
 * /posts/[...slug] → /news/[...slug] permanent redirect.
 *
 * headkit-demo used /posts as the blog URL pattern.
 * apps/starter uses /news. This redirect preserves inbound links and
 * search-engine indexed post URLs after the migration cutover.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  redirect(`/news/${slug.join("/")}`);
}
