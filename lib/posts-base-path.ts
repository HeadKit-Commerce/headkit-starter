import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { TAG } from "@/lib/cache-tags";
import {
  DEFAULT_POSTS_BASE_PATH,
  normalizePostsBasePath,
} from "@/lib/posts-path";

export {
  DEFAULT_POSTS_BASE_PATH,
  normalizePostsBasePath,
  postsArticlePath,
  postsIndexPath,
  resolvePostHref,
} from "@/lib/posts-path";

/**
 * WordPress Settings → Reading → Posts page slug for this store.
 * Falls back to {@link DEFAULT_POSTS_BASE_PATH} (`news`) when unset/invalid.
 *
 * Internal App Router folders stay under `/news`; public URLs use this base
 * via `proxy.ts` rewrites when it differs.
 */
export async function getPostsBasePath(): Promise<string> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.posts, TAG.pages);
  const landing = await sdk.posts.getLanding().catch(() => null);
  return normalizePostsBasePath(landing?.slug) ?? DEFAULT_POSTS_BASE_PATH;
}
