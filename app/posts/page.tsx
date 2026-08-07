import { redirect } from "next/navigation";

/**
 * /posts → /news permanent redirect.
 *
 * headkit-demo used /posts as the blog URL pattern.
 * apps/starter uses /news. This redirect ensures inbound links and
 * search-engine indexed URLs continue to work after the migration cutover.
 */

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : (v ?? "")]),
  ).toString();

  redirect(`/news${qs ? `?${qs}` : ""}`);
}
