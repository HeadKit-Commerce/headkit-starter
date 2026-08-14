import { NextResponse } from "next/server";
import { getPostsBasePath } from "@/lib/posts-base-path";

/**
 * Lightweight JSON for `proxy.ts` rewrites: the WordPress Posts page slug
 * used as the public blog base path for this store.
 *
 * Cacheable — the Posts page rarely changes; proxy revalidates hourly.
 */
export async function GET(): Promise<NextResponse> {
  const base = await getPostsBasePath();
  return NextResponse.json(
    { base },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
