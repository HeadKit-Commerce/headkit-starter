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

/** The WordPress Posts page (Settings → Reading), or null when unset/unreachable. */
export type PostsLanding = Awaited<ReturnType<typeof sdk.posts.getLanding>>;

/**
 * The WordPress Posts page (Settings → Reading) — title, slug, SEO — read
 * ONCE per cache window and shared by every consumer.
 *
 * `getPostsBasePath` below derives the URL base from it, and the post route
 * reads it for the breadcrumb / "Latest {title}" label. Before this helper the
 * route called `sdk.posts.getLanding()` uncached on every request (~0.5 s of
 * origin time per post view) for the same payload this entry already held.
 * Same life and tags as the base path so the theme's post/page purges refresh
 * both together. A failed read caches as null for the window, exactly as the
 * base path already fell back to `news`.
 */
export async function getPostsLanding(): Promise<PostsLanding | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.posts, TAG.pages);
  return sdk.posts.getLanding().catch(() => null);
}

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
  const landing = await getPostsLanding();
  return normalizePostsBasePath(landing?.slug) ?? DEFAULT_POSTS_BASE_PATH;
}
